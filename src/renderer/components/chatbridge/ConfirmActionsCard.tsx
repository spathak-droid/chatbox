import {
  Button,
  Group,
  Paper,
  Stack,
  Text,
} from '@mantine/core'

interface ConfirmActionsCardProps {
  actions: Array<{ id: string; description: string }>
  onConfirm: () => void
  onCancel: () => void
  loading: boolean
}

export function ConfirmActionsCard({ actions, onConfirm, onCancel, loading }: ConfirmActionsCardProps) {
  if (actions.length === 0) return null

  return (
    <Paper
      p="md"
      mx="md"
      mb="xs"
      radius="md"
      style={{
        background: 'var(--mantine-color-dark-6)',
        border: '1px solid var(--mantine-color-yellow-8)',
        flex: '0 0 auto',
      }}
    >
      <Text size="sm" fw={600} c="yellow" mb="xs">
        Confirm these changes to your calendar:
      </Text>
      <Stack gap={4} mb="sm">
        {actions.map((a) => (
          <Text key={a.id} size="sm" c="dimmed">
            {a.description.includes('Delete') ? '\u274C' : a.description.includes('Update') ? '\u270F\uFE0F' : '\u2795'}{' '}
            {a.description}
          </Text>
        ))}
      </Stack>
      <Group gap="xs">
        <Button size="xs" color="green" onClick={onConfirm} loading={loading} disabled={loading}>
          Confirm
        </Button>
        <Button size="xs" variant="subtle" color="gray" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
      </Group>
    </Paper>
  )
}
