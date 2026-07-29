import { router, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import {
  ActivityIndicator,
  Appbar,
  List,
  Button,
  Card,
  Chip,
  Dialog,
  Divider,
  Icon,
  IconButton,
  Menu,
  Portal,
  Snackbar,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api, importRegisteredDocument } from '@/api/client';
import { uploadToDrive } from '@/api/storage';
import { useDashboard, useDocumentActions, useDocuments, useHoldingActions, usePhotos } from '@/data/hooks';
import { PhotoSection } from '@/components/PhotoSection';
import { getLocalFiles, openLocalCopy, saveLocalCopy, type LocalFile } from '@/lib/localFiles';
import { useUnitPref } from '@/lib/units';
import {
  RECORD_PARCEL_MUTATION_MUTATION,
  actionLabel,
  assetGainPct,
  checkLocation,
  documentFileName,
  formatExtent,
  stripTypePrefix,
  formatINR,
} from '@pattadar/core';
import { useQueryClient } from '@tanstack/react-query';

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const theme = useTheme();
  if (!value || value === '—') return null;
  // A value long enough to wrap becomes three ragged right-aligned lines beside
  // its label. Past a threshold it takes its own line and reads left-aligned,
  // which is how "Village · Mandal · District" is meant to be scanned.
  const stacked = value.length > 28;
  return (
    <View style={stacked ? styles.rowStacked : styles.row}>
      <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
        {label}
      </Text>
      <Text
        variant="bodyMedium"
        style={[stacked ? styles.rowValueStacked : styles.rowValue, mono && styles.mono]}
      >
        {value}
      </Text>
    </View>
  );
}

function Section({ title, helper, children }: { title: string; helper?: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <Card mode="outlined" style={styles.section}>
      <Card.Content style={styles.sectionContent}>
        <Text variant="titleSmall">{title}</Text>
        {!!helper && (
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {helper}
          </Text>
        )}
        {children}
      </Card.Content>
    </Card>
  );
}

const money = (v?: number | null) => (v && v > 0 ? formatINR(v) : '');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** CL-93: unambiguous "26 Jul 2026" — never dd/mm/yyyy. */
const date = (v?: string | null) => {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

type LatLng = { latitude: number; longitude: number };

/** Detail view for a parcel or property — data comes from the dashboard cache. */
export default function HoldingDetailScreen() {
  const theme = useTheme();
  const { id, kind } = useLocalSearchParams<{ id: string; kind?: string }>();
  const { data: result, isLoading } = useDashboard();
  const { setParcelGeo, setPropertyGeo, deleteParcel, deleteProperty } = useHoldingActions();
  const { data: docsResult } = useDocuments();
  const { data: photosResult } = usePhotos();
  const { deleteDocument, fileDocument, linkRegisteredToParcel, linkRegisteredToProperty } =
    useDocumentActions();
  const qc = useQueryClient();
  const [docMenu, setDocMenu] = useState('');
  const [mutOpen, setMutOpen] = useState(false);
  const [mutOwner, setMutOwner] = useState('');
  const [mutType, setMutType] = useState('inheritance');
  const [mutBusy, setMutBusy] = useState(false);
  // CL: a free-text new-owner field wrote straight to the record on a single
  // tap — the last chance to catch a typo before it becomes who owns the land.
  const [confirmMutation, setConfirmMutation] = useState<{ oldOwner: string; newOwner: string; type: string } | null>(
    null,
  );
  const unitPref = useUnitPref();
  const [localFiles, setLocalFiles] = useState<Record<string, LocalFile>>({});
  const [docBusy, setDocBusy] = useState(false);
  const [docError, setDocError] = useState('');
  /**
   * What the Add-document button is doing right now.
   *
   * Reading a deed takes the better part of two minutes, and the button said
   * nothing for the whole of it — a spinner with no words is indistinguishable
   * from a button that did nothing, which is exactly how it was reported.
   */
  const [docStage, setDocStage] = useState('');
  const [docSecs, setDocSecs] = useState(0);
  useEffect(() => {
    getLocalFiles().then(setLocalFiles).catch(() => undefined);
  }, [docsResult]);
  const [approx, setApprox] = useState<LatLng | null>(null); // CL-81 geocoded village
  const [geocodeFailed, setGeocodeFailed] = useState(false);
  const [menu, setMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmClearGeo, setConfirmClearGeo] = useState(false);
  const [confirmFarPin, setConfirmFarPin] = useState<LatLng | null>(null);
  const [toast, setToast] = useState('');

  const parcel = kind !== 'property' ? result?.data.parcels.find((p) => p.id === id) : undefined;
  const property = kind === 'property' ? result?.data.properties.find((p) => p.id === id) : undefined;
  const passbook = parcel ? result?.data.passbooks.find((pb) => pb.id === parcel.passbookId) : undefined;

  const title = parcel
    ? `Sy ${parcel.surveyNo}${parcel.subdivision ? `/${parcel.subdivision}` : ''}`
    : property?.label || 'Holding';
  const village = parcel ? passbook?.village || '' : property?.city || '';
  const extentText = parcel
    ? formatExtent(Number(parcel.extent) || 0, unitPref)
    : property?.landArea
      ? `${property.landArea} ${property.landUnit}`
      : property?.builtupArea
        ? `${property.builtupArea} ${property.builtupUnit}`
        : '';

  const value = parcel
    ? Number(parcel.marketValue) || Number(parcel.guidelineValue) || 0
    : Number(property?.currentValue) || 0;
  const purchase = Number(parcel?.purchasePrice ?? property?.purchasePrice) || 0;
  const gain = assetGainPct(value, purchase);

  // geoPoint: "lat,lng" (web GeoMap convention); tolerate spaces/JSON arrays.
  const geo = (() => {
    const raw = (parcel?.geoPoint ?? property?.geoPoint ?? '').replace(/[\[\]\s]/g, '');
    const [lat, lng] = raw.split(',').map(Number);
    return Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)
      ? { latitude: lat, longitude: lng }
      : null;
  })();

  // CL-81: no saved pin → geocode the record's own locality to village level.
  const localityQuery = parcel
    ? [passbook?.village, passbook?.mandal, passbook?.district, 'India'].filter(Boolean).join(', ')
    : [property?.city, property?.district, 'India'].filter(Boolean).join(', ');
  useEffect(() => {
    // CL-565: geocode the village even when a pin IS saved. It used to be
    // skipped in that case, which left nothing to check the pin against — and
    // an unchecked pin is how a Mangala Kunta parcel ended up in California.
    if (!localityQuery || approx || geocodeFailed) return;
    Location.geocodeAsync(localityQuery)
      .then((r) =>
        r[0] ? setApprox({ latitude: r[0].latitude, longitude: r[0].longitude }) : setGeocodeFailed(true),
      )
      .catch(() => setGeocodeFailed(true));
  }, [localityQuery, approx, geocodeFailed]);

  // CL-565: the saved pin, judged against the record's own locality.
  const placeName = parcel ? village : property?.city || '';
  const savedSanity = checkLocation(geo, approx, placeName);
  // The pin about to be saved is now judged inside the location picker,
  // where it is being placed — the check moved with the map.

  const hasValueData = value > 0 || purchase > 0 || Number(parcel?.loanAmount) > 0;
  const hasRegData = Boolean(
    parcel?.regDocNo ||
      parcel?.sro ||
      parcel?.regDate ||
      (parcel?.ecStatus ?? property?.ecStatus) ||
      (parcel?.taxPaidUpto ?? property?.taxPaidUpto),
  );

  // CL-87/201: record milestones + matching audit events, event-first, newest-first.
  const auditMatches = (result?.data.recent ?? []).filter((e) => {
    const hay = `${e.target} ${('details' in e ? (e as { details?: string }).details : '') || ''}`.toLowerCase();
    return (
      (parcel?.surveyNo && hay.includes(String(parcel.surveyNo).toLowerCase())) ||
      (parcel?.ref && hay.includes(String(parcel.ref).toLowerCase())) ||
      (property?.label && hay.includes(String(property.label).toLowerCase()))
    );
  });
  const activityRows = [
    ...(parcel?.regDate ? [{ when: parcel.regDate, what: `Registered${parcel.sro ? ` at ${parcel.sro}` : ''}` }] : []),
    ...(parcel?.purchaseDate ? [{ when: parcel.purchaseDate, what: 'Purchased' }] : []),
    ...((parcel?.createdAt ?? property?.createdAt)
      ? [{ when: (parcel?.createdAt ?? property?.createdAt)!, what: 'Added to Pattadar' }]
      : []),
    ...auditMatches.slice(0, 8).map((e) => ({ when: e.timestamp, what: actionLabel(e.action) })),
  ].sort((a, b) => (b.when || '').localeCompare(a.when || ''));
  const parcelPhotos = (photosResult?.data ?? []).filter((ph) => ph.parcelId === id);
  const linkedDocs = (docsResult?.data.documents ?? []).filter((doc) =>
    parcel ? doc.parcelId === parcel.id : doc.propertyId === property?.id,
  );
  /**
   * The registered deeds — the papers this holding was actually made from.
   *
   * These live in their own table and were never shown here, so a plot created
   * by scanning a deed reported "No documents attached yet" about the very
   * document that created it, and the AI summary read out of that deed had
   * nowhere to be seen.
   */
  const linkedDeeds = (docsResult?.data.registered ?? []).filter((d) =>
    parcel ? d.parcelId === parcel.id : d.propertyId === property?.id,
  );

  // Both parcels and properties can be pinned now that the property geo
  // mutation exists — a plot is the holding whose location is hardest to put
  // into words, so it is the one that needed a pin most.
  const canEditGeo = !!parcel || !!property;
  /**
   * Placing a pin is its own screen (CL: "segue to other screen where user
   * should search and select"). A map inside a scrolling detail page fights
   * the page for every gesture and gives the pin a thumb-sized target; the
   * picker gets the whole viewport and opens already aimed at this record's
   * own locality, with the search field pre-filled with it.
   */
  const openLocationPicker = () =>
    router.push({
      pathname: '/set-location',
      params: {
        id: parcel?.id ?? property?.id ?? '',
        kind: parcel ? 'parcel' : 'property',
        title,
        place: localityQuery,
        ...(geo ? { lat: String(geo.latitude), lng: String(geo.longitude) } : {}),
      },
    });
  /**
   * CL-565: never write a pin that contradicts the record without asking.
   * `force` is the answer to that question, so the confirmation can call back
   * into the same path instead of duplicating the write.
   */
  const saveGeo = async (p: LatLng, force = false) => {
    if (!parcel && !property) return;
    if (!force && checkLocation(p, approx, placeName).suspect) {
      setConfirmFarPin(p);
      return;
    }
    const geoPoint = `${p.latitude.toFixed(6)},${p.longitude.toFixed(6)}`;
    try {
      // Never swallow the error and toast success anyway — that lie hid a
      // broken mutation name for a full day.
      if (parcel) await setParcelGeo.mutateAsync({ id: parcel.id, geoPoint });
      else if (property) await setPropertyGeo.mutateAsync({ id: property.id, geoPoint });
      setToast('Location saved');
    } catch (e) {
      setToast(e instanceof Error ? `Couldn't save: ${e.message}` : "Couldn't save the location");
    }
  };
  const clearGeo = async () => {
    if (!parcel && !property) return;
    try {
      if (parcel) await setParcelGeo.mutateAsync({ id: parcel.id, geoPoint: '' });
      else if (property) await setPropertyGeo.mutateAsync({ id: property.id, geoPoint: '' });
      setToast('Location cleared');
    } catch (e) {
      setToast(e instanceof Error ? `Couldn't clear: ${e.message}` : "Couldn't clear the location");
    }
  };

  const shareText = `${title}${village ? ` · ${village}` : ''}${extentText ? ` · ${extentText}` : ''}${
    parcel?.ref ? `\nRef: ${parcel.ref}` : ''
  }${geo ? `\nhttps://maps.apple.com/?ll=${geo.latitude},${geo.longitude}` : ''}`;

  const geoSaving = setParcelGeo.isPending || setPropertyGeo.isPending;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <Appbar.Header mode="small" statusBarHeight={0}>
        <Appbar.BackAction onPress={() => router.back()} />
        {/* CL-94/206: Paper v5 dropped Appbar subtitle — render our own */}
        <Appbar.Content
          title={
            <View>
              <Text variant="titleLarge" style={styles.bold} numberOfLines={1}>
                {title}
              </Text>
              {!!(extentText || village) && (
                <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={1}>
                  {[extentText, village].filter(Boolean).join(' · ')}
                </Text>
              )}
            </View>
          }
        />
        {(parcel || property) && (
          <Menu
            visible={menu}
            onDismiss={() => setMenu(false)}
            anchor={<Appbar.Action icon="dots-vertical" accessibilityLabel="More actions" onPress={() => setMenu(true)} />}
          >
            <Menu.Item
              leadingIcon="share-variant-outline"
              title="Share"
              onPress={() => {
                setMenu(false);
                Share.share({ message: shareText }).catch(() => undefined);
              }}
            />
            {!!parcel?.ref && (
              <Menu.Item
                leadingIcon="content-copy"
                title="Copy reference"
                onPress={async () => {
                  setMenu(false);
                  await Clipboard.setStringAsync(parcel.ref!).catch(() => undefined);
                  setToast('Reference copied');
                }}
              />
            )}
            {geo && (
              <Menu.Item
                leadingIcon="map-outline"
                title="View full map"
                onPress={() => {
                  setMenu(false);
                  Linking.openURL(
                    `https://maps.apple.com/?ll=${geo.latitude},${geo.longitude}&q=${encodeURIComponent(title)}`,
                  ).catch(() => undefined);
                }}
              />
            )}
            <Divider />
            {/* CL-571/574: destructive, so it sits with the other destructive
                action and asks first — it used to be a red button under the
                map, one tap from wiping the pin with no confirmation. */}
            {canEditGeo && !!geo && (
              <Menu.Item
                leadingIcon="map-marker-off-outline"
                title="Clear location…"
                onPress={() => {
                  setMenu(false);
                  setConfirmClearGeo(true);
                }}
              />
            )}
            <Menu.Item
              leadingIcon="delete-outline"
              title={parcel ? 'Delete parcel…' : 'Delete property…'}
              onPress={() => {
                setMenu(false);
                setConfirmDelete(true);
              }}
            />
          </Menu>
        )}
      </Appbar.Header>
      {isLoading || (!parcel && !property) ? (
        <View style={styles.center}>
          {isLoading ? (
            <ActivityIndicator />
          ) : (
            <Text variant="bodyMedium">This holding is no longer available.</Text>
          )}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {/* "Agri" filled and "Owned" outlined read as one-selected-one-not,
              but they are independent descriptors and neither is a choice. Both
              are already stated in the Holding section, so the row is gone.
              Litigation stays: it is an exception worth flagging, not a label. */}
          {(parcel?.litigation || property?.litigation) && (
            <View style={styles.chips}>
              <Chip compact mode="outlined" textStyle={[styles.chipText, { color: theme.colors.error }]}>
                Litigation
              </Chip>
            </View>
          )}

          <Section title="Holding">
            {/* CL-88/211: khata and owner navigate, with a visible affordance */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="See all holdings of this owner"
              onPress={() =>
                router.push({
                  pathname: '/(tabs)/holdings',
                  params: { q: parcel?.currentOwner || property?.currentOwner || '' },
                })
              }
            >
              <Row
                label="Owner"
                value={(parcel?.currentOwner || property?.currentOwner) ? `${parcel?.currentOwner || property?.currentOwner} ›` : ''}
              />
            </Pressable>
            {/* CL-207: the label documents the ordering — no floating helper */}
            <Row
              label="Village · Mandal · District"
              value={
                parcel
                  ? [passbook?.village, passbook?.mandal, passbook?.district].filter(Boolean).join(' · ')
                  : [property?.city, property?.district].filter(Boolean).join(' · ')
              }
            />
            {!!passbook && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open passbook ${passbook.pattadarNo}`}
                onPress={() => router.push({ pathname: '/(tabs)/holdings', params: { pb: passbook.id } })}
              >
                <Row label="Khata" value={`${passbook.pattadarNo} ›`} />
              </Pressable>
            )}
            {/* CL-90: shared formatter. Units change in Settings — cycling
                them from a stray tap here was a footgun. */}
            <Row label="Extent" value={extentText} />
            {/* CL-91: monospace, wrapping, tap-to-copy */}
            {!!parcel?.ref && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Copy reference number"
                onPress={async () => {
                  await Clipboard.setStringAsync(parcel.ref!).catch(() => undefined);
                  setToast('Reference copied');
                }}
              >
                <View style={styles.refRow}>
                  <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                    Reference
                  </Text>
                  <Text variant="bodySmall" style={[styles.mono, styles.refValue]}>
                    {parcel.ref}  ⧉
                  </Text>
                </View>
              </Pressable>
            )}
            <Row label="Added" value={date(parcel?.createdAt ?? property?.createdAt)} />
          </Section>

          {hasValueData && (
            <Section title="Value">
              <Row label="Market value" value={money(parcel?.marketValue ?? property?.marketValue)} />
              <Row label="Guideline value" value={money(parcel?.guidelineValue ?? property?.guidelineValue)} />
              <Row label="Current value" value={money(property?.currentValue)} />
              <Row label="Purchase price" value={money(purchase)} />
              <Row label="Purchased on" value={date(parcel?.purchaseDate)} />
              {gain !== null && <Row label="Gain since purchase" value={`${gain > 0 ? '+' : ''}${gain}%`} />}
              <Row label="Loan outstanding" value={money(parcel?.loanAmount)} />
            </Section>
          )}

          {hasRegData && (
            <Section title="Registration & compliance">
              <Row label="Reg. doc no" value={parcel?.regDocNo || ''} />
              <Row label="SRO" value={parcel?.sro || ''} />
              <Row label="Reg. date" value={date(parcel?.regDate)} />
              <Row label="EC status" value={parcel?.ecStatus ?? property?.ecStatus ?? ''} />
              <Row label="EC date" value={date(parcel?.ecDate ?? property?.ecDate)} />
              <Row label="Tax paid up to" value={date(parcel?.taxPaidUpto ?? property?.taxPaidUpto)} />
            </Section>
          )}

          {/* CL-81..85: read-only map by default; explicit edit mode */}
          <Section
            title="Location"
          >
            {geo && (
              <>
                <MapView
                  style={styles.map}
                  pointerEvents="none"
                  accessibilityLabel={`Map showing ${title} at ${geo.latitude.toFixed(4)}, ${geo.longitude.toFixed(4)}`}
                  initialRegion={{ ...geo, latitudeDelta: 0.005, longitudeDelta: 0.005 }}
                >
                  <Marker coordinate={geo} />
                </MapView>
                {/* CL-572: coordinates are for using elsewhere — make them takeable. */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Copy coordinates ${geo.latitude.toFixed(6)}, ${geo.longitude.toFixed(6)}`}
                  onPress={async () => {
                    await Clipboard.setStringAsync(`${geo.latitude.toFixed(6)},${geo.longitude.toFixed(6)}`).catch(
                      () => undefined,
                    );
                    setToast('Coordinates copied');
                  }}
                  style={styles.coordRow}
                >
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    {geo.latitude.toFixed(6)}, {geo.longitude.toFixed(6)}
                  </Text>
                  <Icon source="content-copy" size={13} color={theme.colors.onSurfaceVariant} />
                </Pressable>
                {/* CL-565: say so, and offer the fix — the pin is the only thing
                    on this screen that can be silently, catastrophically wrong. */}
                {savedSanity.suspect && (
                  <View style={[styles.geoWarn, { backgroundColor: theme.colors.errorContainer }]}>
                    <Text variant="bodySmall" style={{ color: theme.colors.onErrorContainer }}>
                      {savedSanity.message}
                    </Text>
                    {canEditGeo && !!approx && (
                      <Button
                        mode="contained-tonal"
                        icon="crosshairs-gps"
                        compact
                        loading={geoSaving}
                        disabled={geoSaving}
                        onPress={() => saveGeo(approx)}
                      >
                        Move to {placeName || 'the village'}
                      </Button>
                    )}
                  </View>
                )}
                {/* CL-574: edit and view sit together; destroy lives in the
                    overflow menu with the other destructive action. */}
                <View style={styles.geoActions}>
                  {canEditGeo && (
                    <Button mode="text" icon="pencil-outline" onPress={openLocationPicker}>
                      Edit location
                    </Button>
                  )}
                  <Button
                    mode="text"
                    icon="map-outline"
                    onPress={() =>
                      Linking.openURL(
                        `https://maps.apple.com/?ll=${geo.latitude},${geo.longitude}&q=${encodeURIComponent(title)}`,
                      ).catch(() => undefined)
                    }
                  >
                    Open in Maps
                  </Button>
                </View>
              </>
            )}
            {!geo && approx && (
              <>
                <MapView
                  style={styles.mapSmall}
                  pointerEvents="none"
                  accessibilityLabel={`Approximate map of ${village}`}
                  initialRegion={{ ...approx, latitudeDelta: 0.05, longitudeDelta: 0.05 }}
                />
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  Showing {village} (approximate) — the exact spot isn’t pinned yet.
                </Text>
                {/* CL-209/210: the ONE primary action on this screen */}
                {canEditGeo && (
                  <Button mode="contained" icon="map-marker-plus-outline" onPress={openLocationPicker}>
                    Set exact location
                  </Button>
                )}
              </>
            )}
            {!geo && !approx && (
              <>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  Location not set.
                </Text>
                {canEditGeo && (
                  <Button mode="contained" icon="map-marker-plus-outline" onPress={openLocationPicker}>
                    Set location
                  </Button>
                )}
              </>
            )}
          </Section>

          {/* CL-561: photographs sit between Location and Documents — they are
              evidence about the ground, not paperwork about the title. Parcels
              only: a property has no parcel row to hang them on. */}
          {!!parcel && (
            <Section title="Photos">
              <PhotoSection
                parcelId={parcel.id}
                parcelLabel={title}
                photos={parcelPhotos}
                villageCentroid={approx}
                placeName={placeName}
                onNotify={setToast}
              />
            </Section>
          )}

          <Section title="Documents">
            {/* A deed leads with what it SAYS — the summary is the reason to
                tap it. Plain attachments are files and behave like files. */}
            {linkedDeeds.map((d) => (
              <Pressable
                key={d.id}
                style={styles.docLine}
                accessibilityRole="button"
                accessibilityLabel={`What ${d.docType || 'this deed'} says`}
                onPress={() => router.push({ pathname: '/document/[id]', params: { id: d.id } })}
              >
                <List.Icon icon="text-box-search-outline" color={theme.colors.primary} />
                <View style={styles.growShrink}>
                  <Text variant="bodyMedium" style={styles.bold} numberOfLines={1}>
                    {[d.docType || 'Registered document', d.documentNo && `No. ${d.documentNo}`]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                  <Text
                    variant="labelSmall"
                    style={{ color: theme.colors.onSurfaceVariant }}
                    numberOfLines={2}
                  >
                    {d.headline || d.summary || 'Filed before summaries were kept — tap to open the file.'}
                  </Text>
                </View>
                <List.Icon icon="chevron-right" color={theme.colors.onSurfaceVariant} />
              </Pressable>
            ))}
            {linkedDocs.map((doc) => {
              // The doc type is rendered separately below — strip it from the title.
              const fname = stripTypePrefix(localFiles[doc.id]?.name || '', doc.docType);
              const ext = fname.split('.').pop()?.toLowerCase() ?? '';
              const icon = ext === 'pdf' ? 'file-pdf-box' : /jpe?g|png|heic/.test(ext) ? 'file-image-outline' : 'file-outline';
              return (
                /* CL-198/199/200: filename primary, type as chip, actions in ⋮ */
                <View key={doc.id} style={styles.docLine}>
                  <List.Icon icon={icon} color={theme.colors.primary} />
                  <Pressable
                    style={styles.growShrink}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${fname || doc.docType || 'document'}`}
                    onPress={() => openLocalCopy(doc.id).catch((e) => setDocError(e.message))}
                  >
                    <Text variant="bodyMedium" style={styles.bold} numberOfLines={1}>
                      {fname || doc.docType || 'Document'}
                    </Text>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={1}>
                      {[doc.docType, fname ? 'on this phone' : 'no local copy'].filter(Boolean).join(' · ')}
                    </Text>
                  </Pressable>
                  <Menu
                    visible={docMenu === doc.id}
                    onDismiss={() => setDocMenu('')}
                    anchor={
                      <IconButton
                        icon="dots-vertical"
                        size={18}
                        style={styles.tightIcon}
                        accessibilityLabel={`Actions for ${fname || doc.docType || 'document'}`}
                        onPress={() => setDocMenu(doc.id)}
                        hitSlop={8}
                      />
                    }
                  >
                    <Menu.Item
                      leadingIcon="open-in-new"
                      title="Open"
                      onPress={() => {
                        setDocMenu('');
                        openLocalCopy(doc.id).catch((e) => setDocError(e.message));
                      }}
                    />
                    <Divider />
                    <Menu.Item
                      leadingIcon="link-off"
                      title="Remove from this holding…"
                      onPress={async () => {
                        setDocMenu('');
                        await deleteDocument.mutateAsync(doc.id).catch((e) => setDocError(String(e?.message ?? e)));
                        setToast('Document removed. Its file stays on this phone and on the web.');
                      }}
                    />
                  </Menu>
                </View>
              );
            })}
            {linkedDocs.length === 0 && linkedDeeds.length === 0 && (
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                No documents attached yet.
              </Text>
            )}
            <Button
              mode="outlined"
              icon="file-plus-outline"
              loading={docBusy}
              disabled={docBusy}
              onPress={async () => {
                setDocError('');
                let ticker: ReturnType<typeof setInterval> | undefined;
                try {
                  const res = await DocumentPicker.getDocumentAsync({
                    type: ['application/pdf', 'image/*'],
                    copyToCacheDirectory: true,
                  });
                  if (res.canceled || !res.assets?.[0]) return;
                  const a = res.assets[0];
                  // CL-198: same filename already attached here → refuse the dup.
                  if (
                    linkedDocs.some((doc) => localFiles[doc.id]?.name === a.name) ||
                    linkedDeeds.some((d) => localFiles[d.id]?.name === a.name)
                  ) {
                    setDocError(`"${a.name}" is already attached to this holding.`);
                    return;
                  }
                  setDocBusy(true);
                  /**
                   * Read it, then KEEP what was read.
                   *
                   * This spent the better part of a minute having the deed
                   * read by AI and then threw all of it away except
                   * `doc_type` — the summary, the parties, the survey number,
                   * the consideration, every extracted field — and filed a
                   * bare row that could say nothing about itself. The file was
                   * never uploaded either, so there was no copy off the phone.
                   * It now files the same registered document the Add-property
                   * scan does, so the summary has somewhere to live and the row
                   * can be opened.
                   */
                  const mime = a.mimeType ?? 'application/pdf';
                  const startedAt = Date.now();
                  ticker = setInterval(
                    () => setDocSecs(Math.round((Date.now() - startedAt) / 1000)),
                    1000,
                  );
                  setDocStage('Reading');
                  const fields = await importRegisteredDocument(a.uri, a.name, mime).catch(
                    () => ({}) as Record<string, unknown>,
                  );
                  let fileRef = '';
                  setDocStage('Uploading');
                  try {
                    fileRef = (await uploadToDrive(a.uri, a.name, mime)).id;
                  } catch {
                    // The reading still stands without the bytes.
                  }
                  setDocStage('Filing');
                  const filed = await fileDocument.mutateAsync({ ...fields, _fileRef: fileRef });
                  const docId = filed.createRegisteredDocument?.id;
                  if (!docId) throw new Error("Couldn't attach the document.");
                  if (parcel) await linkRegisteredToParcel.mutateAsync({ id: docId, parcelId: parcel.id });
                  else if (property)
                    await linkRegisteredToProperty.mutateAsync({ id: docId, propertyId: property.id });
                  await saveLocalCopy(
                    docId,
                    a.uri,
                    documentFileName(
                      { docType: String(fields.doc_type ?? ''), village, surveyNo: parcel?.surveyNo ?? '' },
                      a.name,
                    ),
                  ).catch(() => undefined);
                  setLocalFiles(await getLocalFiles());
                  setToast(
                    String(fields.summary ?? '').trim()
                      ? 'Document added — tap it to see what it says.'
                      : 'Document added.',
                  );
                } catch (e) {
                  setDocError(e instanceof Error ? e.message : 'Could not add the document');
                } finally {
                  if (ticker) clearInterval(ticker);
                  setDocStage('');
                  setDocSecs(0);
                  setDocBusy(false);
                }
              }}
            >
              {docStage
                ? `${docStage} the document… ${docSecs}s`
                : 'Add document'}
            </Button>
            {docStage === 'Reading' && docSecs > 8 && (
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                Reading a deed usually takes under a minute. Stay on this screen until it finishes.
              </Text>
            )}
            {!!docError && (
              <Text variant="bodySmall" style={{ color: theme.colors.error }}>
                {docError}
              </Text>
            )}
          </Section>

          {/* CL-201/202/203: app activity, event-first, newest-first — and a real
              CTA wired to recordParcelMutation instead of a permanent apology. */}
          <Section title="Activity" helper="What happened to this record in Pattadar — newest first.">
            {activityRows.map((x, i) => (
              <View key={`${x.when}-${i}`} style={styles.actRow}>
                <Text variant="bodyMedium" style={[styles.bold, styles.growShrink]} numberOfLines={2}>
                  {x.what}
                </Text>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {date(x.when)}
                </Text>
              </View>
            ))}
            {parcel && (
              <Button mode="text" icon="swap-horizontal" style={styles.leftBtn} onPress={() => setMutOpen(true)}>
                Record ownership change
              </Button>
            )}
          </Section>
        </ScrollView>
      )}
      <Portal>
        <Dialog visible={mutOpen} onDismiss={() => setMutOpen(false)}>
          <Dialog.Title>Record ownership change</Dialog.Title>
          <Dialog.Content style={styles.mutGap}>
            <TextInput label="New owner" value={mutOwner} onChangeText={setMutOwner} mode="outlined" />
            <View style={styles.chips}>
              {['inheritance', 'sale', 'gift', 'partition'].map((t) => (
                <Chip
                  key={t}
                  compact
                  selected={mutType === t}
                  mode={mutType === t ? 'flat' : 'outlined'}
                  style={mutType === t ? { backgroundColor: theme.colors.primaryContainer } : undefined}
                  textStyle={[styles.chipText, mutType === t && { color: theme.colors.onPrimaryContainer }]}
                  onPress={() => setMutType(t)}
                >
                  {t}
                </Chip>
              ))}
            </View>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setMutOpen(false)}>Cancel</Button>
            <Button
              mode="contained"
              disabled={!mutOwner.trim()}
              onPress={() => {
                setMutOpen(false);
                setConfirmMutation({
                  oldOwner: parcel?.currentOwner || property?.currentOwner || 'No owner on record',
                  newOwner: mutOwner.trim(),
                  type: mutType,
                });
              }}
            >
              Continue
            </Button>
          </Dialog.Actions>
        </Dialog>
        {/* The write itself — a summary of old owner → new owner is the last
            chance to catch a typo before it becomes who owns the land. */}
        <Dialog visible={confirmMutation !== null} onDismiss={() => setConfirmMutation(null)}>
          <Dialog.Title>Confirm ownership change</Dialog.Title>
          <Dialog.Content style={styles.mutGap}>
            <Text variant="bodyMedium" style={styles.bold}>
              {confirmMutation?.oldOwner} → {confirmMutation?.newOwner}
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Recorded as {confirmMutation?.type}. This is added to the audit log.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button
              onPress={() => {
                setConfirmMutation(null);
                setMutOpen(true);
              }}
            >
              Back
            </Button>
            <Button
              mode="contained"
              loading={mutBusy}
              disabled={mutBusy}
              onPress={async () => {
                if (!parcel || !confirmMutation) return;
                setMutBusy(true);
                try {
                  await api.gql(RECORD_PARCEL_MUTATION_MUTATION, {
                    id: parcel.id,
                    newOwner: confirmMutation.newOwner,
                    src: confirmMutation.type,
                    type: confirmMutation.type,
                  });
                  qc.invalidateQueries({ queryKey: ['pattadar'] });
                  setConfirmMutation(null);
                  setMutOwner('');
                  setToast('Ownership change recorded');
                } catch (e) {
                  setToast(e instanceof Error ? e.message : "Couldn't record the change");
                } finally {
                  setMutBusy(false);
                }
              }}
            >
              Record
            </Button>
          </Dialog.Actions>
        </Dialog>
        {/* CL-565: the last gate before a wrong pin becomes the record. */}
        <Dialog visible={confirmFarPin !== null} onDismiss={() => setConfirmFarPin(null)}>
          <Dialog.Title>Is this the right spot?</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">{checkLocation(confirmFarPin, approx, placeName).message}</Text>
            <Text variant="bodyMedium" style={styles.dialogGap}>
              Save it anyway only if you know the land really is there.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmFarPin(null)}>Cancel</Button>
            {!!approx && (
              <Button
                onPress={() => {
                  setConfirmFarPin(null);
                  saveGeo(approx, true);
                }}
              >
                Use {placeName || 'village'}
              </Button>
            )}
            <Button
              loading={geoSaving}
              disabled={geoSaving}
              onPress={() => {
                const p = confirmFarPin;
                setConfirmFarPin(null);
                if (p) saveGeo(p, true);
              }}
            >
              Save anyway
            </Button>
          </Dialog.Actions>
        </Dialog>
        {/* CL-571: clearing a pin destroys the only precise thing on the record. */}
        <Dialog visible={confirmClearGeo} onDismiss={() => setConfirmClearGeo(false)}>
          <Dialog.Title>Clear the location?</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">
              {title} goes back to showing {placeName || 'its village'} approximately. The record itself is not
              affected, and you can pin it again.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmClearGeo(false)}>Cancel</Button>
            <Button
              textColor={theme.colors.error}
              loading={geoSaving}
              disabled={geoSaving}
              onPress={async () => {
                setConfirmClearGeo(false);
                await clearGeo();
              }}
            >
              Clear
            </Button>
          </Dialog.Actions>
        </Dialog>
        <Dialog visible={confirmDelete} onDismiss={() => setConfirmDelete(false)}>
          <Dialog.Title>Delete {title}?</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">
              The record, its location, and its document links are removed. This is recorded in the audit log.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmDelete(false)}>Cancel</Button>
            <Button
              textColor={theme.colors.error}
              loading={deleteParcel.isPending || deleteProperty.isPending}
              disabled={deleteParcel.isPending || deleteProperty.isPending}
              onPress={async () => {
                if (parcel) await deleteParcel.mutateAsync(parcel.id).catch(() => undefined);
                else if (property) await deleteProperty.mutateAsync(property.id).catch(() => undefined);
                setConfirmDelete(false);
                router.back();
              }}
            >
              Delete
            </Button>
          </Dialog.Actions>
        </Dialog>
        <Snackbar visible={!!toast} onDismiss={() => setToast('')} duration={2500}>
          {toast}
        </Snackbar>
      </Portal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16, gap: 12, paddingBottom: 32 },
  chips: { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
  chipText: { fontSize: 11, textTransform: 'capitalize' },
  section: { borderRadius: 16 },
  sectionContent: { gap: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  rowValue: { fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  rowStacked: { gap: 2 },
  rowValueStacked: { fontWeight: '600', textAlign: 'left' },
  refRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' },
  refValue: { flexShrink: 1, textAlign: 'right' },
  mono: { fontFamily: 'Menlo', fontSize: 12 },
  map: { height: 220, borderRadius: 16 },
  mapSmall: { height: 140, borderRadius: 16 },
  geoRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  geoSearch: { flex: 1 },
  geoActions: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  coordRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32 },
  geoWarn: { borderRadius: 10, padding: 12, gap: 10, alignItems: 'flex-start' },
  dialogGap: { marginTop: 8 },
  docRow: { justifyContent: 'flex-start' },
  docLine: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44 },
  growShrink: { flex: 1 },
  tightIcon: { margin: 0 },
  actRow: { flexDirection: 'row', alignItems: 'baseline', gap: 12, justifyContent: 'space-between' },
  leftBtn: { alignSelf: 'flex-start' },
  mutGap: { gap: 12 },
  bold: { fontWeight: '700' },
});
