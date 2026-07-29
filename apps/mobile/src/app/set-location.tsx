import { checkLocation } from '@pattadar/core';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, View } from 'react-native';
import MapView, { type Region } from 'react-native-maps';
import {
  ActivityIndicator,
  Appbar,
  Button,
  Divider,
  HelperText,
  Icon,
  IconButton,
  List,
  Dialog,
  Portal,
  Searchbar,
  Snackbar,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useHoldingActions } from '@/data/hooks';

type LatLng = { latitude: number; longitude: number };

/** A place the search turned up, or the device's own position. */
interface Suggestion {
  key: string;
  title: string;
  subtitle: string;
  icon: string;
  coord: LatLng | null; // null = resolve on tap (current location)
}

/**
 * Village/locality name from a reverse-geocode result — shared by the pin's
 * address readout and by search-result titles, so the two never disagree
 * about how to describe the same kind of point.
 */
function localityLabel(a?: Location.LocationGeocodedAddress | null): string {
  return a ? [a.name, a.district, a.subregion || a.city, a.region].filter(Boolean).join(', ') : '';
}

/**
 * Pick a location — the whole screen, the way every map app does it.
 *
 * This used to be a small map embedded in the detail page with a draggable
 * marker. That arrangement fights itself: the map competes with the page for
 * every pan gesture, the marker is a ~30pt target, and your thumb covers the
 * exact pixel you are trying to place. So the pin here does not move at all —
 * it is fixed to the centre of the screen and the MAP moves underneath it,
 * which is what Uber, Airbnb, Google Maps and Swiggy all settled on. The thing
 * you are aiming is never under your finger.
 *
 * The other half is not making people start from nothing. The record already
 * knows roughly where it is, so the map opens aimed at its own village and the
 * search field is pre-filled with that locality — the common case becomes a
 * nudge and a tap rather than a search from a blank field.
 */
export default function SetLocationScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{
    id: string;
    kind: string;
    title: string;
    /** "Nallapadu, Guntur, Andhra Pradesh" — seeds the search and the aim. */
    place: string;
    /** Existing pin, if there is one. */
    lat?: string;
    lng?: string;
  }>();
  const isParcel = params.kind === 'parcel';
  const placeLabel = (params.place || '').split(',')[0]?.trim() || '';

  const saved: LatLng | null = (() => {
    const la = Number(params.lat);
    const ln = Number(params.lng);
    return Number.isFinite(la) && Number.isFinite(ln) && (la !== 0 || ln !== 0)
      ? { latitude: la, longitude: ln }
      : null;
  })();

  const mapRef = useRef<MapView | null>(null);
  const { setParcelGeo, setPropertyGeo } = useHoldingActions();

  // The point under the fixed centre pin. Tracked from the map, so it is
  // always exactly what the user sees, never a stale marker coordinate.
  const [centre, setCentre] = useState<LatLng | null>(saved);
  /**
   * Has this coordinate actually been chosen?
   *
   * The map reports its centre as soon as it lays out, so `centre` was populated
   * with wherever the map happened to open — and with no saved pin that was a
   * hardcoded national default. Tapping Save without touching anything wrote
   * it. One parcel in the live database reads exactly 16.500000, 80.600000,
   * 150 km from its own village, by precisely that route.
   */
  const [aimed, setAimed] = useState(Boolean(saved));
  const [confirmFar, setConfirmFar] = useState(false);
  const [query, setQuery] = useState(params.place || '');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Suggestion[] | null>(null);
  const [address, setAddress] = useState('');
  const [resolving, setResolving] = useState(false);
  const [approx, setApprox] = useState<LatLng | null>(null);
  const [ready, setReady] = useState(Boolean(saved));
  const [toast, setToast] = useState('');
  const [saving, setSaving] = useState(false);
  /**
   * Manual lat/lng entry — the fallback for placing the pin without touching
   * the map at all. react-native-maps exposes nothing to VoiceOver, so
   * dragging the world under a fixed pin is not an option for a screen-reader
   * user; typing two numbers is.
   */
  const [manualOpen, setManualOpen] = useState(false);
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');
  const [manualError, setManualError] = useState('');

  /** Aim: the saved pin if there is one, otherwise the record's own village. */
  useEffect(() => {
    if (!params.place) {
      setReady(true);
      return;
    }
    Location.geocodeAsync(params.place)
      .then((r) => {
        if (!r[0]) return;
        const c = { latitude: r[0].latitude, longitude: r[0].longitude };
        setApprox(c);
        // Only move the camera when there is no saved pin to respect.
        if (!saved) {
          setCentre(c);
          setAimed(true);
          mapRef.current?.animateToRegion({ ...c, latitudeDelta: 0.02, longitudeDelta: 0.02 }, 400);
        }
      })
      .catch(() => undefined)
      .finally(() => setReady(true));
    // Aimed once, on entry — re-aiming as the user pans would fight them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Say where the pin is in words, not coordinates.
   *
   * Debounced, because region changes fire continuously while panning and each
   * one is a geocoder round-trip.
   */
  const reverseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const describe = useCallback((c: LatLng) => {
    if (reverseTimer.current) clearTimeout(reverseTimer.current);
    setResolving(true);
    reverseTimer.current = setTimeout(() => {
      Location.reverseGeocodeAsync(c)
        .then((r) => setAddress(localityLabel(r[0])))
        .catch(() => setAddress(''))
        .finally(() => setResolving(false));
    }, 500);
  }, []);

  useEffect(() => {
    if (centre) describe(centre);
    return () => {
      if (reverseTimer.current) clearTimeout(reverseTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centre?.latitude, centre?.longitude]);

  /** Is this pin anywhere near where the record says it is? */
  const sanity = checkLocation(centre, approx, placeLabel);

  const runSearch = async (q: string) => {
    const term = q.trim();
    if (!term) return;
    Keyboard.dismiss();
    setSearching(true);
    try {
      const found = await Location.geocodeAsync(term).catch(() => []);
      // Every hit used to repeat the search term as its title, with only the
      // raw coordinates underneath — six rows all reading "Nallapadu" are not
      // six choices, they are one choice shown six times. Reverse-geocoding
      // each hit gives it its own name.
      const withTitles = await Promise.all(
        found.slice(0, 6).map(async (r, i) => {
          const coord = { latitude: r.latitude, longitude: r.longitude };
          const rev = await Location.reverseGeocodeAsync(coord).catch(() => []);
          const label = localityLabel(rev[0]);
          return {
            key: `${r.latitude},${r.longitude},${i}`,
            title: label || `${term} (${i + 1})`,
            subtitle: `${r.latitude.toFixed(4)}, ${r.longitude.toFixed(4)}`,
            icon: 'map-marker-outline',
            coord,
          };
        }),
      );
      setResults(withTitles);
    } finally {
      setSearching(false);
    }
  };

  const goTo = (c: LatLng, zoom = 0.01) => {
    setResults(null);
    setCentre(c);
    setAimed(true);
    mapRef.current?.animateToRegion({ ...c, latitudeDelta: zoom, longitudeDelta: zoom }, 450);
  };

  const useMyLocation = async () => {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) {
      setToast('Location permission denied — search or move the map instead.');
      return;
    }
    const loc = await Location.getCurrentPositionAsync({}).catch(() => null);
    if (loc) goTo({ latitude: loc.coords.latitude, longitude: loc.coords.longitude }, 0.004);
    else setToast('Could not get a fix on your position.');
  };

  /** Place the pin from typed coordinates — the map is never touched. */
  const submitManual = () => {
    const la = Number(manualLat.trim());
    const ln = Number(manualLng.trim());
    if (!Number.isFinite(la) || !Number.isFinite(ln)) {
      setManualError('Enter a number for both latitude and longitude.');
      return;
    }
    if (la < -90 || la > 90 || ln < -180 || ln > 180) {
      setManualError('Latitude must be -90 to 90, longitude -180 to 180.');
      return;
    }
    setManualError('');
    setManualOpen(false);
    setManualLat('');
    setManualLng('');
    goTo({ latitude: la, longitude: ln }, 0.01);
  };

  /**
   * Writing a coordinate the app has already judged implausible.
   *
   * The banner said the pin was far from the record's own village and then the
   * Save button wrote it anyway — the check was decoration. The parcel-detail
   * path (saveGeo) has always gated on this; this screen, which replaced it,
   * did not. `force` is the answer to the confirmation, so the confirmed path
   * re-enters here rather than duplicating the write.
   */
  const save = async (force = false) => {
    if (!centre) return;
    if (!force && sanity.suspect) {
      setConfirmFar(true);
      return;
    }
    setConfirmFar(false);
    setSaving(true);
    const geoPoint = `${centre.latitude.toFixed(6)},${centre.longitude.toFixed(6)}`;
    try {
      // Never report success without the write having succeeded.
      if (isParcel) await setParcelGeo.mutateAsync({ id: params.id, geoPoint });
      else await setPropertyGeo.mutateAsync({ id: params.id, geoPoint });
      router.back();
    } catch (e) {
      setToast(e instanceof Error ? `Couldn’t save: ${e.message}` : 'Couldn’t save the location');
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <Appbar.Header mode="small" statusBarHeight={0}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content
          title={saved ? 'Edit location' : 'Set location'}
          subtitle={params.title || undefined}
        />
      </Appbar.Header>

      <View style={styles.searchWrap}>
        <Searchbar
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => runSearch(query)}
          onClearIconPress={() => setResults(null)}
          placeholder="Search a village or place"
          mode="bar"
          style={styles.search}
          inputStyle={styles.searchInput}
          loading={searching}
        />
      </View>

      {results !== null ? (
        <View style={styles.results}>
          <List.Item
            title="Use my current location"
            left={() => <List.Icon icon="crosshairs-gps" />}
            onPress={useMyLocation}
          />
          <Divider />
          {results.length === 0 ? (
            <Text variant="bodyMedium" style={[styles.noHits, { color: theme.colors.onSurfaceVariant }]}>
              Nothing found for “{query.trim()}”. Try the village and district together, or move the
              map by hand.
            </Text>
          ) : (
            results.map((r) => (
              <List.Item
                key={r.key}
                title={r.title}
                description={r.subtitle}
                left={() => <List.Icon icon={r.icon} />}
                onPress={() => r.coord && goTo(r.coord)}
              />
            ))
          )}
          <Button mode="text" onPress={() => setResults(null)}>
            Back to the map
          </Button>
        </View>
      ) : (
        <View style={styles.mapWrap}>
          {!ready && (
            <View style={styles.loading}>
              <ActivityIndicator />
            </View>
          )}
          <MapView
            ref={mapRef}
            style={styles.map}
            initialRegion={{
              // No saved pin and no geocoded village yet: open wide over the
              // state rather than on a plausible-looking point. A tight default
              // reads as an answer; a whole-state view reads as a question, and
              // Save is disabled until something is actually aimed at.
              ...(saved ?? approx ?? { latitude: 16.5, longitude: 79.9 }),
              latitudeDelta: saved ? 0.01 : approx ? 0.02 : 6,
              longitudeDelta: saved ? 0.01 : approx ? 0.02 : 6,
            }}
            onRegionChangeComplete={(r: Region, details?: { isGesture?: boolean }) => {
              setCentre({ latitude: r.latitude, longitude: r.longitude });
              // Only a deliberate pan counts; the layout pass does not.
              if (details?.isGesture) setAimed(true);
            }}
          />
          {/* The pin belongs to the SCREEN, not the map — it never moves, so it
              is never under the thumb that is moving the map. pointerEvents
              none so it cannot swallow a pan. */}
          <View style={styles.pinLayer} pointerEvents="none">
            {/* A dot marking the exact coordinate, and the marker sitting on
                top of it — the marker's TIP is the point, so the glyph is
                lifted by its own height. Without this the saved coordinate is
                the middle of the balloon, ~20pt north of where it looks. */}
            <View style={styles.pinStack}>
              <Icon source="map-marker" size={44} color={theme.colors.error} />
            </View>
            <View style={[styles.pinDot, { borderColor: theme.colors.error }]} />
          </View>
          <IconButton
            icon="pencil-outline"
            mode="contained"
            style={styles.manual}
            accessibilityLabel="Enter coordinates manually"
            onPress={() => setManualOpen(true)}
          />
          <IconButton
            icon="crosshairs-gps"
            mode="contained"
            style={styles.gps}
            accessibilityLabel="Use my current location"
            onPress={useMyLocation}
          />
        </View>
      )}

      {results === null && (
        <View style={[styles.sheet, { backgroundColor: theme.colors.surface }]}>
          {/* Words first, coordinates second — a lat/lng pair tells nobody
              whether the pin landed in the right village. `accessibilityLiveRegion`
              so VoiceOver reads the new place out loud as the pin moves — the
              map itself gives a screen reader nothing to go on. */}
          <Text variant="titleSmall" numberOfLines={2} accessibilityLiveRegion="polite">
            {resolving ? 'Finding this place…' : address || 'Move the map to place the pin'}
          </Text>
          {!!centre && (
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {centre.latitude.toFixed(6)}, {centre.longitude.toFixed(6)}
            </Text>
          )}
          {sanity.suspect && (
            <Pressable
              style={[styles.warn, { backgroundColor: theme.colors.errorContainer }]}
              onPress={() => approx && goTo(approx, 0.05)}
              accessibilityRole="button"
              accessibilityHint={`Recentre on ${placeLabel || 'the village'}`}
            >
              <Text variant="bodySmall" style={{ color: theme.colors.onErrorContainer }}>
                {sanity.message}
                {approx ? `  Tap to go back to ${placeLabel || 'the village'}.` : ''}
              </Text>
            </Pressable>
          )}
          {!aimed && (
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Move the map, search, or use your location to place the pin.
            </Text>
          )}
          <Button
            mode="contained"
            icon="check"
            disabled={!centre || !aimed || saving}
            loading={saving}
            onPress={() => save()}
          >
            {saved ? 'Update location' : 'Save this location'}
          </Button>
        </View>
      )}

      <Portal>
        <Dialog
          visible={manualOpen}
          onDismiss={() => {
            setManualOpen(false);
            setManualError('');
          }}
        >
          <Dialog.Title>Enter coordinates</Dialog.Title>
          <Dialog.Content style={styles.manualFields}>
            <TextInput
              label="Latitude"
              value={manualLat}
              onChangeText={setManualLat}
              keyboardType="numbers-and-punctuation"
              mode="outlined"
              placeholder="16.500000"
            />
            <TextInput
              label="Longitude"
              value={manualLng}
              onChangeText={setManualLng}
              keyboardType="numbers-and-punctuation"
              mode="outlined"
              placeholder="80.600000"
            />
            {!!manualError && <HelperText type="error" visible>{manualError}</HelperText>}
          </Dialog.Content>
          <Dialog.Actions>
            <Button
              onPress={() => {
                setManualOpen(false);
                setManualError('');
              }}
            >
              Cancel
            </Button>
            <Button onPress={submitManual}>Use this location</Button>
          </Dialog.Actions>
        </Dialog>
        <Dialog visible={confirmFar} onDismiss={() => setConfirmFar(false)}>
          <Dialog.Title>Save this location anyway?</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">{sanity.message}</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmFar(false)}>Go back</Button>
            {!!approx && (
              <Button
                onPress={() => {
                  setConfirmFar(false);
                  goTo(approx, 0.05);
                }}
              >
                Centre on {placeLabel || 'the village'}
              </Button>
            )}
            <Button textColor={theme.colors.error} onPress={() => save(true)}>
              Save anyway
            </Button>
          </Dialog.Actions>
        </Dialog>
        <Snackbar visible={!!toast} onDismiss={() => setToast('')} duration={4000}>
          {toast}
        </Snackbar>
      </Portal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  searchWrap: { paddingHorizontal: 16, paddingBottom: 8 },
  search: { height: 46 },
  searchInput: { minHeight: 0, paddingBottom: 8 },
  mapWrap: { flex: 1 },
  map: { flex: 1 },
  loading: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  // The marker's point sits at the centre; the glyph is offset up by half its
  // height so the TIP is the coordinate, not the middle of the balloon.
  pinLayer: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  // 44pt glyph, lifted 22pt so its tip lands on the centre of the screen.
  pinStack: { position: 'absolute', transform: [{ translateY: -22 }] },
  pinDot: { width: 8, height: 8, borderRadius: 4, borderWidth: 2 },
  gps: { position: 'absolute', right: 12, bottom: 12 },
  manual: { position: 'absolute', right: 12, bottom: 64 },
  results: { flex: 1 },
  noHits: { padding: 16 },
  sheet: { padding: 16, gap: 8, borderTopLeftRadius: 16, borderTopRightRadius: 16, elevation: 3 },
  warn: { borderRadius: 10, padding: 10 },
  manualFields: { gap: 12 },
});
