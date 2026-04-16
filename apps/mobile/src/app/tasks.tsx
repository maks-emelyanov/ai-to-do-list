import { Card } from '@ui/card';
import { HStack } from '@ui/hstack';
import { VStack } from '@ui/vstack';
import { TabScreenShell } from '../components/tab-screen-shell';
import { ThemedText } from '../components/themed-text';

const taskGroups = [
  { title: 'Inbox', count: 12, note: 'Quick captures and untriaged ideas' },
  { title: 'Work', count: 8, note: 'Active product and engineering tasks' },
  { title: 'Personal', count: 5, note: 'Errands, habits, and follow-ups' },
];

export default function TasksScreen() {
  return (
    <TabScreenShell
      eyebrow="Tasks"
      title="Everything in one clean queue."
      description="Browse your task buckets, triage new work, and jump into the list that needs attention next.">
      <Card className="rounded-[28px] p-5" style={{ borderWidth: 0 }}>
        <HStack className="items-center justify-between gap-4">
          <VStack className="gap-1">
            <ThemedText type="small" themeColor="textSecondary">
              Open tasks
            </ThemedText>
            <ThemedText type="subtitle">25</ThemedText>
          </VStack>
          <Card className="rounded-full px-4 py-3" style={{ borderWidth: 0 }}>
            <ThemedText type="smallBold">6 flagged</ThemedText>
          </Card>
        </HStack>
      </Card>

      <VStack className="gap-3">
        {taskGroups.map((group) => (
          <Card key={group.title} className="rounded-[24px] p-4" style={{ borderWidth: 0 }}>
            <HStack className="items-center justify-between gap-4">
              <VStack className="flex-1 gap-1">
                <ThemedText>{group.title}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {group.note}
                </ThemedText>
              </VStack>
              <ThemedText type="smallBold">{group.count}</ThemedText>
            </HStack>
          </Card>
        ))}
      </VStack>
    </TabScreenShell>
  );
}
