import { Avatar, AvatarFallbackText } from '@ui/avatar';
import { Button, ButtonText } from '@ui/button';
import { Card } from '@ui/card';
import { HStack } from '@ui/hstack';
import { VStack } from '@ui/vstack';
import { useAuth } from '../auth/auth-context';
import { TabScreenShell } from '../components/tab-screen-shell';
import { ThemedText } from '../components/themed-text';

const preferences = [
  { label: 'Focus mode', value: 'Weekdays, 9:00 - 12:00' },
  { label: 'Default list', value: 'Inbox' },
  { label: 'Notifications', value: 'Smart reminders enabled' },
];

export default function ProfileScreen() {
  const { refreshUser, sendVerificationEmail, signOut, user } = useAuth();
  const displayName = user?.displayName || user?.email?.split('@')[0] || 'You';
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part: string) => part[0])
    .join('')
    .toUpperCase();

  return (
    <TabScreenShell
      eyebrow="Profile"
      title="Your workflow, tuned to you."
      description="Personal settings, productivity snapshots, and the controls that make the app feel like your own workspace.">
      <Card className="rounded-[28px] p-5" style={{ borderWidth: 0 }}>
        <VStack className="gap-5">
          <HStack className="items-center gap-4">
            <Avatar size="lg" className="bg-emerald-500">
              <AvatarFallbackText>{initials || 'ME'}</AvatarFallbackText>
            </Avatar>
            <VStack className="flex-1 gap-1">
              <ThemedText type="subtitle">{displayName}</ThemedText>
              <ThemedText themeColor="textSecondary">
                {user?.email ?? 'Signed in with Firebase Auth'}
              </ThemedText>
            </VStack>
          </HStack>

          <Button action="secondary" className="rounded-full" onPress={signOut} size="lg">
            <ButtonText>Sign out</ButtonText>
          </Button>
        </VStack>
      </Card>

      {user?.email && !user.emailVerified ? (
        <Card className="rounded-[24px] p-4" style={{ borderWidth: 0 }}>
          <VStack className="gap-4">
            <VStack className="gap-1">
              <ThemedText>Email not verified</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Verify your email to keep account recovery and security settings reliable.
              </ThemedText>
            </VStack>
            <HStack className="gap-3">
              <Button
                action="primary"
                className="flex-1 rounded-full"
                onPress={sendVerificationEmail}
                size="md">
                <ButtonText>Send link</ButtonText>
              </Button>
              <Button
                action="secondary"
                className="flex-1 rounded-full"
                onPress={refreshUser}
                size="md">
                <ButtonText>Refresh</ButtonText>
              </Button>
            </HStack>
          </VStack>
        </Card>
      ) : null}

      <VStack className="gap-3">
        {preferences.map((item) => (
          <Card key={item.label} className="rounded-[24px] p-4" style={{ borderWidth: 0 }}>
            <VStack className="gap-1">
              <ThemedText>{item.label}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {item.value}
              </ThemedText>
            </VStack>
          </Card>
        ))}
      </VStack>
    </TabScreenShell>
  );
}
