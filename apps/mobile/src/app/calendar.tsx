import { Card } from '@ui/card';
import { HStack } from '@ui/hstack';
import { VStack } from '@ui/vstack';
import { TabScreenShell } from '../components/tab-screen-shell';
import { ThemedText } from '../components/themed-text';

const agenda = [
  { time: '9:00', title: 'Standup prep', subtitle: 'Review yesterday’s notes' },
  { time: '11:30', title: 'Design handoff', subtitle: 'Finalize task owners' },
  { time: '4:00', title: 'Weekly reset', subtitle: 'Reschedule anything unfinished' },
];

export default function CalendarScreen() {
  return (
    <TabScreenShell
      eyebrow="Calendar"
      title="See the shape of your week."
      description="A scheduling view for deadlines, time blocks, and the moments where tasks need to turn into a plan.">
      <Card className="rounded-[28px] p-5" style={{ borderWidth: 0 }}>
        <VStack className="gap-2">
          <ThemedText type="small" themeColor="textSecondary">
            This week
          </ThemedText>
          <ThemedText type="subtitle">14 scheduled items</ThemedText>
          <ThemedText themeColor="textSecondary">
            Your busiest day is Thursday, with three meetings and two deadline windows.
          </ThemedText>
        </VStack>
      </Card>

      <VStack className="gap-3">
        {agenda.map((entry) => (
          <Card key={entry.time} className="rounded-[24px] p-4" style={{ borderWidth: 0 }}>
            <HStack className="items-start gap-4">
              <Card className="rounded-[18px] px-3 py-2" style={{ borderWidth: 0 }}>
                <ThemedText type="smallBold">{entry.time}</ThemedText>
              </Card>
              <VStack className="flex-1 gap-1">
                <ThemedText>{entry.title}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {entry.subtitle}
                </ThemedText>
              </VStack>
            </HStack>
          </Card>
        ))}
      </VStack>
    </TabScreenShell>
  );
}
