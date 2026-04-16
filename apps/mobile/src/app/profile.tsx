import { Avatar, AvatarFallbackText } from '@ui/avatar';
import { Card } from '@ui/card';
import { HStack } from '@ui/hstack';
import { VStack } from '@ui/vstack';
import { TabScreenShell } from '../components/tab-screen-shell';
import { ThemedText } from '../components/themed-text';

const preferences = [
  { label: 'Focus mode', value: 'Weekdays, 9:00 - 12:00' },
  { label: 'Default list', value: 'Inbox' },
  { label: 'Notifications', value: 'Smart reminders enabled' },
];

export default function ProfileScreen() {
  return (
    <TabScreenShell
      eyebrow="Profile"
      title="Your workflow, tuned to you."
      description="Personal settings, productivity snapshots, and the controls that make the app feel like your own workspace.">
      <Card className="rounded-[28px] p-5" style={{ borderWidth: 0 }}>
        <HStack className="items-center gap-4">
          <Avatar size="lg" className="bg-emerald-500">
            <AvatarFallbackText>MK</AvatarFallbackText>
          </Avatar>
          <VStack className="flex-1 gap-1">
            <ThemedText type="subtitle">Maks</ThemedText>
            <ThemedText themeColor="textSecondary">
              83% of tasks completed on time this month.
            </ThemedText>
          </VStack>
        </HStack>
      </Card>

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
