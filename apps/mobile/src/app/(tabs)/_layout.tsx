import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import { useTheme } from 'react-native-paper';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

function tabIcon(name: IconName) {
  return ({ color, size }: { color: ColorValue; size: number }) => (
    <MaterialCommunityIcons name={name} color={color} size={size} />
  );
}

export default function TabsLayout() {
  const theme = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.outlineVariant,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Dashboard', tabBarIcon: tabIcon('view-dashboard-outline') }}
      />
      <Tabs.Screen
        name="holdings"
        options={{ title: 'Holdings', tabBarIcon: tabIcon('terrain') }}
      />
      <Tabs.Screen
        name="family"
        options={{ title: 'Family', tabBarIcon: tabIcon('account-group-outline') }}
      />
      <Tabs.Screen
        name="invitations"
        options={{ title: 'Invites', tabBarIcon: tabIcon('email-outline') }}
      />
    </Tabs>
  );
}
