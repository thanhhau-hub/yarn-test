import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useRole } from '../../hooks/useRole';
import { ActivityIndicator, View } from 'react-native';

/**
 * Tab navigation layout.
 * 
 * Dynamically shows/hides tabs based on user role:
 * - Supervisor: Board, Add, History
 * - Worker:     Board, History
 */
export default function TabLayout() {
  const { role, loading } = useRole();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' }}>
        <ActivityIndicator size="large" color="#1b4d3e" />
      </View>
    );
  }

  const isSupervisor = role === 'supervisor';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#1b4d3e',
        tabBarInactiveTintColor: '#999',
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopColor: '#eee',
          height: 60,
          paddingBottom: 8,
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

      {/* Add tab: only visible to Supervisors */}
      <Tabs.Screen
        name="add"
        options={{
          title: 'Add',
          headerTitle: 'Add Lot',
          // Hide from Workers by removing it from the tab bar
          href: isSupervisor ? undefined : null,
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

      {/* Hidden screens – still routable but not in tab bar */}
      <Tabs.Screen
        name="search"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="manage-areas"
        options={{ href: null, title: 'Manage Areas' }}
      />
      <Tabs.Screen
        name="move/[id]"
        options={{ href: null, title: 'Move Lot' }}
      />
    </Tabs>
  );
}
