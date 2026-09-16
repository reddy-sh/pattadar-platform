'use client';

import PropTypes from 'prop-types';
import isEqual from 'lodash/isEqual';
import { useMemo, useState, useEffect, useCallback } from 'react';


import { useLocalStorage } from 'src/hooks/use-local-storage';

import { SettingsContext } from './settings-context';

// ----------------------------------------------------------------------

const STORAGE_KEY = 'settings';
const THEME_CHOICES = ['light', 'dark', 'highContrast'];

function resolveThemeChoice(settings) {
  if (THEME_CHOICES.includes(settings.themeChoice)) return settings.themeChoice;
  if (settings.themeContrast === 'bold') return 'highContrast';
  if (settings.themeMode === 'dark') return 'dark';
  return 'light';
}

export function SettingsProvider({ children, defaultSettings }) {
  const { state, update, reset } = useLocalStorage(STORAGE_KEY, defaultSettings);

  const [openDrawer, setOpenDrawer] = useState(false);
  const [settingsReady, setSettingsReady] = useState(false);
  const themeChoice = resolveThemeChoice(state);

  // useLocalStorage registers its restoration effect before this one. Waiting
  // one effect pass prevents ThemeProvider from overwriting the restored choice
  // with defaults during hydration.
  useEffect(() => {
    setSettingsReady(true);
  }, []);

  // Drawer
  const onToggleDrawer = useCallback(() => {
    setOpenDrawer((prev) => !prev);
  }, []);

  const onCloseDrawer = useCallback(() => {
    setOpenDrawer(false);
  }, []);

  const canReset = !isEqual(state, defaultSettings);

  const memoizedValue = useMemo(
    () => ({
      ...state,
      themeChoice,
      settingsReady,
      onUpdate: update,
      // Reset
      canReset,
      onReset: reset,
      // Drawer
      open: openDrawer,
      onToggle: onToggleDrawer,
      onClose: onCloseDrawer,
    }),
    [
      reset,
      update,
      state,
      themeChoice,
      settingsReady,
      canReset,
      openDrawer,
      onCloseDrawer,
      onToggleDrawer,
    ]
  );

  return <SettingsContext.Provider value={memoizedValue}>{children}</SettingsContext.Provider>;
}

SettingsProvider.propTypes = {
  children: PropTypes.node,
  defaultSettings: PropTypes.object,
};
