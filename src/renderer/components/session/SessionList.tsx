import type { DragEndEvent } from '@dnd-kit/core'
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import NiceModal from '@ebay/nice-modal-react'
import { ActionIcon, Flex, Text, Tooltip } from '@mantine/core'
import { IconArchive, IconSearch } from '@tabler/icons-react'
import { useRouterState } from '@tanstack/react-router'
import type { MutableRefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { Virtuoso } from 'react-virtuoso'
import { NavLink } from '@mantine/core'
import { useNavigate } from '@tanstack/react-router'
import { useIsSmallScreen } from '@/hooks/useScreenChange'
import { useSessionList } from '@/stores/chatStore'
import { reorderSessions } from '@/stores/sessionActions'
import { useUIStore } from '@/stores/uiStore'
import SessionItem from './SessionItem'

export interface Props {
  sessionListViewportRef: MutableRefObject<HTMLDivElement | null>
}

export default function SessionList(props: Props) {
  const { t } = useTranslation()
  const { sessionMetaList: sortedSessions, refetch } = useSessionList()
  const setOpenSearchDialog = useUIStore((s) => s.setOpenSearchDialog)
  const setShowSidebar = useUIStore((s) => s.setShowSidebar)
  const navigate = useNavigate()
  const isSmallScreen = useIsSmallScreen()
  const sensors = useSensors(
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 10,
      },
    }),
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 10,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )
  const onDragEnd = async (event: DragEndEvent) => {
    if (!event.over) {
      return
    }
    if (!sortedSessions) {
      return
    }
    const activeId = event.active.id
    const overId = event.over.id
    if (activeId !== overId) {
      const oldIndex = sortedSessions.findIndex((s) => s.id === activeId)
      const newIndex = sortedSessions.findIndex((s) => s.id === overId)
      await reorderSessions(oldIndex, newIndex)
      refetch()
    }
  }
  const routerState = useRouterState()

  return (
    <>
      <Flex align="center" py="xs" px="md" gap={'xs'}>
        <Text c="chatbox-tertiary" flex={1}>
          {t('Chat')}
        </Text>

        <Tooltip label={t('Search')} openDelay={1000} withArrow>
          <ActionIcon
            variant="subtle"
            color="chatbox-tertiary"
            size={20}
            onClick={() => setOpenSearchDialog(true, true)}
          >
            <IconSearch />
          </ActionIcon>
        </Tooltip>

        <Tooltip label={t('Clear Conversation List')} openDelay={1000} withArrow>
          <ActionIcon
            variant="subtle"
            color="chatbox-tertiary"
            size={20}
            onClick={() => NiceModal.show('clear-session-list')}
          >
            <IconArchive />
          </ActionIcon>
        </Tooltip>
      </Flex>

      <DndContext
        modifiers={[restrictToVerticalAxis]}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        {sortedSessions && (
          <SortableContext items={sortedSessions} strategy={verticalListSortingStrategy}>
            <Virtuoso
              style={{ flex: 1 }}
              data={sortedSessions}
              scrollerRef={(ref) => {
                if (ref instanceof HTMLDivElement) {
                  props.sessionListViewportRef.current = ref
                }
              }}
              itemContent={(_index, session) => (
                <SortableItem id={session.id}>
                  <SessionItem
                    selected={routerState.location.pathname === `/session/${session.id}`}
                    session={session}
                  />
                </SortableItem>
              )}
            />
          </SortableContext>
        )}
      </DndContext>

      <NavLink
        c="chatbox-secondary"
        className="rounded"
        mx="xs"
        mt={4}
        label="TutorMeAI"
        leftSection={<span style={{ fontSize: 18, width: 20, textAlign: 'center' }}>🎓</span>}
        active={routerState.location.pathname === '/chatbridge'}
        onClick={() => {
          navigate({ to: '/chatbridge' })
          if (isSmallScreen) {
            setShowSidebar(false)
          }
        }}
        variant="light"
        p="xs"
      />
    </>
  )
}

function SortableItem(props: { id: string; children?: React.ReactNode }) {
  const { id, children } = props
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id })
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  )
}
