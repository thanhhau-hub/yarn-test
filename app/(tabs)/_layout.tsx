import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useRole } from '../../hooks/useRole';
import { ActivityIndicator, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Tab navigation layout.
 * 
 * Dynamically shows/hides tabs based on user role:
 * - Admin/Supervisor: Board, Add, History, Admin
 * - Guest (User):     Board, History
 */
export default function TabLayout() {
  const { role, loading } = useRole();
  const insets = useSafeAreaInsets();

  // Do not conditionally return a View here! It breaks Expo Router.
  // The layout must always return the <Tabs> component.

  const canManage = role === 'supervisor' || role === 'admin';
  const isAdmin = role === 'admin';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#1b4d3e',
        tabBarInactiveTintColor: '#999',
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopColor: '#eee',
          height: 60 + insets.bottom,
          paddingBottom: Math.max(insets.bottom, 10),
        },
        headerStyle: { backgroundColor: '#1b4d3e' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Board',
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="grid-outline" size={size} color={color} />
          ),
        }}
      />

      {/* Add tab: only visible to Supervisors/Admins */}
      <Tabs.Screen
        name="add"
        options={{
          title: 'Add',
          headerTitle: 'Add Lot',
          // Hide from Guests by removing it from the tab bar
          href: canManage ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="add-circle-outline" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          headerTitle: 'Warehouse History',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="time-outline" size={size} color={color} />
          ),
        }}
      />

      {/* Admin tab: only visible to Supervisors/Admins */}
      <Tabs.Screen
        name="admin"
        options={{
          title: 'Manage',
          headerTitle: 'Management Dashboard',
          href: isAdmin ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />

      {/* Hidden screens – still routable but not in tab bar */}
      <Tabs.Screen
        name="search"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="move/[id]"
        options={{ href: null, title: 'Move Lot' }}
      />
    </Tabs>
  );
}
