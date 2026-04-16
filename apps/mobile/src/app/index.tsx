import { Badge, BadgeText } from '@ui/badge';
import { Card } from '@ui/card';
import { HStack } from '@ui/hstack';
import { VStack } from '@ui/vstack';
import { TabScreenShell } from '../components/tab-screen-shell';
import { ThemedText } from '../components/themed-text';

const priorities = [
  { label: 'Morning review', detail: '3 tasks ready', accent: '92%' },
  { label: 'Deep work block', detail: 'Design handoff at 11:30', accent: '2h focus' },
  { label: 'Personal errands', detail: '1 task due tonight', accent: 'Low stress' },
];

export default function TodayScreen() {
  return (
    <TabScreenShell
      eyebrow="Today"
      title="Stay on top of what matters."
      description="A focused view for the tasks that deserve your attention before the day gets away from you.">
      <Card className="rounded-[28px] p-5" style={{ borderWidth: 0 }}>
        <VStack className="gap-4">
          <Badge action="info" variant="solid" size="md" className="self-start rounded-full px-3">
            <BadgeText>On track</BadgeText>
          </Badge>
          <ThemedText type="title" style={{ fontSize: 40, lineHeight: 44 }}>
            7 tasks
          </ThemedText>
          <ThemedText themeColor="textSecondary">
            Two are due before lunch and one has been waiting since yesterday.
          </ThemedText>
          <HStack className="gap-3">
            <Card className="min-h-24 flex-1 rounded-[22px] p-4" style={{ borderWidth: 0 }}>
              <ThemedText type="small" themeColor="textSecondary">
                Completed
              </ThemedText>
              <ThemedText type="subtitle">4</ThemedText>
            </Card>
            <Card className="min-h-24 flex-1 rounded-[22px] p-4" style={{ borderWidth: 0 }}>
              <ThemedText type="small" themeColor="textSecondary">
                Focus time
              </ThemedText>
              <ThemedText type="subtitle">2.5h</ThemedText>
            </Card>
          </HStack>
        </VStack>
      </Card>

      <VStack className="gap-3">
        {priorities.map((item) => (
          <Card key={item.label} className="rounded-[24px] p-4" style={{ borderWidth: 0 }}>
            <HStack className="items-start justify-between gap-4">
              <VStack className="flex-1 gap-1">
                <ThemedText>{item.label}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {item.detail}
                </ThemedText>
              </VStack>
              <ThemedText type="smallBold">{item.accent}</ThemedText>
            </HStack>
          </Card>
        ))}
      </VStack>
    </TabScreenShell>
  );
}
