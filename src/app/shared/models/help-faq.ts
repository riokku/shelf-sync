/** A page this FAQ answer points to, rendered as a plain routerLink below
 *  the answer text rather than an inline hyperlink inside it — needed
 *  because HelpComponent's search filters/renders this list from a plain
 *  data array (see HelpFaqSection below), and an inline `<a>` can't safely
 *  live inside a `{{ }}`-interpolated string the way `PrivacyComponent`'s
 *  static prose could get away with. */
export interface HelpFaqLink {
  path: string;
  label: string;
}

export interface HelpFaqItem {
  question: string;
  answer: string;
  links?: HelpFaqLink[];
}

export interface HelpFaqSection {
  title: string;
  /** e.g. "(admin only)" — shown next to the section title. */
  audience?: string;
  items: HelpFaqItem[];
}

export const HELP_FAQ_SECTIONS: HelpFaqSection[] = [
  {
    title: 'Getting started',
    items: [
      {
        question: 'How do I invite my team?',
        answer: 'Go to Manage > Team and copy the invite link near the top of the page. Anyone who signs up with it joins your organization automatically, as a pending request — an admin still needs to approve them under "Pending join requests" before they can see or do anything.',
        links: [{ path: '/manage/team', label: 'Manage > Team' }]
      },
      {
        question: 'How do I add my first inventory item?',
        answer: 'Admins and managers can create items from Manage > Inventory\'s "Create item" tab. Which fields show on that form (and which columns show on the Inventory table) can be trimmed down by an admin under Manage > Settings.',
        links: [{ path: '/manage/inventory', label: 'Manage > Inventory' }, { path: '/manage/settings', label: 'Manage > Settings' }]
      },
      {
        question: 'How do I create a task?',
        answer: 'Admins and managers can create and assign tasks to anyone from Manage > Tasks. Everyone can see and update the status of tasks assigned to them from the Tasks page.',
        links: [{ path: '/manage/tasks', label: 'Manage > Tasks' }, { path: '/tasks', label: 'Tasks' }]
      }
    ]
  },
  {
    title: 'Inventory',
    items: [
      {
        question: 'What\'s the difference between card and table view?',
        answer: 'Both show the same items — card view is a browsable gallery, table view is a sortable grid. Switch between them with the toggle above the item list on the Inventory page. An admin controls which optional columns the table view shows under Manage > Settings > Data.',
        links: [{ path: '/inventory', label: 'Inventory' }, { path: '/manage/settings', label: 'Manage > Settings' }]
      },
      {
        question: 'What\'s the difference between a single quantity and tracking by container/box?',
        answer: 'A single-quantity item just tracks one number for how much is left. A container/box-tracked item instead splits its stock into individually-editable boxes (e.g. 5 boxes of 20), each with its own location — useful when you need to know exactly which box or pallet has stock. You choose which way to track an item when creating it.'
      },
      {
        question: 'How do I discard damaged, lost, or expired stock?',
        answer: 'Open the item\'s detail popup and use the "Discard" button. You\'ll pick a quantity (and, for a container-tracked item, which box) plus one or more reasons — discarding permanently reduces the item\'s stock and is logged to its activity history.'
      },
      {
        question: 'How do I retire an item?',
        answer: 'Once an item\'s remaining quantity hits zero, anyone can request retiring it from its detail popup. Depending on your organization\'s Settings > Workflow configuration, that either needs an admin/manager\'s approval or takes effect immediately. A retired item is hidden from the default Inventory view.'
      },
      {
        question: 'What does locking an item do?',
        answer: 'Admins and managers can lock an item from its detail popup to stop anyone else from editing it — useful while you\'re in the middle of correcting its data. Only an admin or manager can unlock it again.'
      },
      {
        question: 'Can I export my inventory data?',
        answer: 'Admins and managers can export a CSV of every item (active, pending, and retired) from the "Export" button on Manage > Inventory, with each item\'s full activity history included.',
        links: [{ path: '/manage/inventory', label: 'Manage > Inventory' }]
      }
    ]
  },
  {
    title: 'Reservations & orders',
    items: [
      {
        question: 'What\'s a reservation?',
        answer: 'A reservation books a quantity of an item\'s stock for a future date range (e.g. for an upcoming event), so it doesn\'t get double-booked. It\'s separate from checking an item out — nothing about its stock or checked-out status changes until someone actually picks the reservation up.',
        links: [{ path: '/manage/reservations', label: 'Manage > Reservations' }]
      },
      {
        question: 'What\'s a restock order, and what happens when I mark one received?',
        answer: 'An order is a restock request placed against an item\'s linked supplier. Marking an order received automatically adds its quantity back to a single-quantity item\'s stock — a container/box-tracked item just gets marked received, since you\'ll still need to add or update a box yourself with where the new stock actually is.',
        links: [{ path: '/manage/orders', label: 'Manage > Orders' }]
      }
    ]
  },
  {
    title: 'Tasks',
    items: [
      {
        question: 'How do I hand off a task to someone else?',
        answer: 'Open the task and offer a transfer to another approved team member — it stays in your queue until they accept it. They can also decline it, which leaves it with you unchanged.'
      },
      {
        question: 'What do the task statuses mean?',
        answer: 'To do, In Progress, and Done — the assignee (or an admin/manager) can move a task between any of them from its detail popup.'
      }
    ]
  },
  {
    title: 'Team & roles',
    items: [
      {
        question: 'What can each role do?',
        answer: 'Staff can browse inventory, manage their own tasks, and request things like retirement or a task transfer. Managers get access to most of the Manage hub — inventory, tasks, team, orders, reservations, reports. Admins get everything managers do, plus billing, the danger zone, and site-wide settings.'
      },
      {
        question: 'How do I see who\'s online?',
        answer: 'Manage > Team shows a small pulsing dot on anyone currently online, or "Last seen..." otherwise. The header also shows a live count of how many teammates are online right now, next to your organization\'s name.',
        links: [{ path: '/manage/team', label: 'Manage > Team' }]
      }
    ]
  },
  {
    title: 'Notifications',
    items: [
      {
        question: 'What shows up in the bell icon?',
        answer: 'A task assigned directly to you, a task transfer offered to you, an inventory retirement request needing admin/manager approval, and a new join request needing admin approval. The same four events can also send an email, unless an admin has turned that category off under Manage > Settings > Workflow.',
        links: [{ path: '/manage/settings', label: 'Manage > Settings' }]
      }
    ]
  },
  {
    title: 'Settings & branding',
    audience: '(admin only)',
    items: [
      {
        question: 'Where do I customize the theme and logo?',
        answer: 'Manage > Settings\' Style tab has a color theme picker and a logo upload — both apply site-wide, even before signing in.',
        links: [{ path: '/manage/settings', label: 'Manage > Settings' }]
      },
      {
        question: 'Where do I control which fields and columns show?',
        answer: 'The Data tab lets you trim which optional fields appear on the "Create item" form and which optional columns the Inventory page\'s table view shows, plus the approved category/physical-location/discard-reason option lists.',
        links: [{ path: '/manage/settings', label: 'Manage > Settings' }]
      },
      {
        question: 'Where do I turn off retirement approval, bulk edit, or a specific email notification?',
        answer: 'All under the Workflow tab — retirement approval and bulk edit are each a single toggle, and email notifications have their own toggle per event kind.',
        links: [{ path: '/manage/settings', label: 'Manage > Settings' }]
      }
    ]
  },
  {
    title: 'Account',
    items: [
      {
        question: 'How do I change my avatar or switch between light and dark mode?',
        answer: 'Both are on your Account page.',
        links: [{ path: '/account', label: 'Account' }]
      },
      {
        question: 'How do I reset my password?',
        answer: 'Use "Forgot password?" on the login screen to request a reset link by email.'
      }
    ]
  }
];
