import { Check, ChevronDown } from 'lucide-react';
import { type ButtonHTMLAttributes, type ComponentType, type ReactNode } from 'react';

import { panelStyle, useMenuState, type Anchor } from '@/shared/lib/menu-anchor';
import { useIsMobile } from '@/shared/lib/mobile';
import { cn } from '@/shared/lib/utils';
import { BottomSheet } from '@/shared/ui/atoms/bottom-sheet';
import { Button } from '@/shared/ui/atoms/button';
import { HIGHLIGHT, FLOATING_SURFACE, SURGE } from '@/shared/ui/foundations/surface';

/*
  `list` has no role on the panel: the listbox is INSIDE it, supplied by the
  caller with its options as direct children —the same structure as `search`
  and as `Combo`—. With the panel as the listbox, the caller had nowhere to
  put a scroll box without wedging it between the listbox and its options.
*/
const ROLE = { menu: 'menu', panel: 'dialog', list: undefined, search: 'dialog' } as const;
const ARIA = { menu: 'menu', panel: 'dialog', list: 'listbox', search: 'dialog' } as const;

type TriggerProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'type' | 'id' | 'onClick' | 'className' | 'children'
>;

interface MenuProps {
  /** What the button says. With `isIconOnly`, it becomes its accessible name. */
  label: string;
  Icon?: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  isIconOnly?: boolean;
  /** Paints the button switched on: something in here is selected. */
  isActive?: boolean;
  align?: 'left' | 'right';
  /**
   * Which way it opens. `up` for triggers that live at the foot of
   * something: opening downward, the panel runs off the screen and half of
   * the options are left outside.
   */
  direction?: 'down' | 'up';
  /** How wide the panel is when it does not copy its trigger's. See `WIDTHS`. */
  width?: keyof typeof WIDTHS;
  /**
   * `menu` is a list of actions; `panel` is a form inside a dropdown;
   * `list` is a field that picks one value among several.
   * Announcing as a menu something that holds pickers makes a screen reader
   * promise "pick an option" and deliver something else.
   *
   * `search` is a `list` with its search box: it stays attached to its
   * field as a `list` does, but the panel is a dialog and not a list,
   * because a list can only contain options and in here there is a text box,
   * buttons and the actual list. Whoever fills the panel supplies the list.
   */
  kind?: 'menu' | 'panel' | 'list' | 'search';
  /** Classes of the box that wraps everything. To stretch it across. */
  boxClassName?: string;
  /** Classes of the button when a custom `trigger` is passed. */
  triggerClassName?: string;
  /**
   * Places the panel against the WINDOW instead of against its box.
   *
   * For the ones that live inside something that scrolls —a long form in a
   * modal, a table—: there any ancestor with `overflow` clips whatever
   * sticks out of it, and a dropdown, by definition, sticks out.
   */
  isFloating?: boolean;
  /**
   * How the button looks. `tool` is the box of the filter bars; `ghost` is
   * just the icon, for the ones that live inside a card and must not compete
   * with its content.
   */
  /**
   * `default` is the accent: for the main action of a bar. The other two
   * are secondary controls. The HEIGHT and the radius are not chosen here
   * —`size="sm"` on the button sets them— so that a menu always measures the
   * same as the filters next to it.
   */
  variant?: 'tool' | 'ghost' | 'default';
  /**
   * Removes the panel's padding.
   *
   * The panel carries 4px all around so that an option's highlight is a pill
   * inside it and not a band that crashes into the curve of the corner. A
   * panel with FULL-BLEED strips —a search box on top with its line, a
   * "create" at the bottom with its own— needs the opposite: with the
   * padding, those lines would stop 4px short of each side.
   */
  isUnpadded?: boolean;
  /**
   * The `id` of the BUTTON, not of the box.
   *
   * It is needed so that a floating label can point at it with `htmlFor`.
   * And it has to be the button: `htmlFor` only works on labelable elements
   * —`button`, `input`, `select`, `textarea`— and a `div` or a `span` is not
   * among them, so a label pointing at the box stays unassociated and
   * whoever navigates with a screen reader hears "button" and nothing
   * more.
   */
  triggerId?: string | undefined;
  /**
   * When floating, lets the panel take ITS OWN width instead of the button's.
   *
   * By default a floating panel copies the width of its trigger, and that is
   * right for a dropdown: a panel wider than its field reads as another
   * element. But a calendar does not fit in a field —it needs seven columns—
   * and shrinking it to the button's width leaves days three pixels wide.
   *
   * With this the `width` class applies, and the panel is clipped to the gap
   * left up to the edge of the window instead of running off it.
   */
  hasOwnWidth?: boolean;
  /** Replaces the button entirely (the avatar, for example). */
  trigger?: (props: { isOpen: boolean }) => ReactNode;
  /**
   * Extra attributes for a custom `trigger`'s button, given whether it is open.
   *
   * For a select-only combobox: the button keeps the focus while the list is
   * open, so IT says which option is active and handles the arrows.
   */
  triggerProps?: (state: { isOpen: boolean; close: () => void }) => TriggerProps;
  /** Runs when the button opens the panel: to point at the chosen option. */
  onOpen?: () => void;
  children: ReactNode | ((close: () => void) => ReactNode);
}

/**
 * A dropdown.
 *
 * ── Why it is one component and not three ───────────────────────────────────
 * The filter, the sort and the account menu are the same mechanism: a button
 * that opens a panel, which closes on a tap outside and with Escape. Written
 * three times, that mechanism gets fixed once and stays broken in the other
 * two — which is exactly how you end up with menus that close by themselves
 * on one screen and not on another.
 *
 * What changes between them is the content, and that is what gets passed.
 *
 * ── And on the phone it does not drop down: it RISES ────────────────────────
 * Below the breakpoint, a `menu` and a `panel` open as a sheet from the
 * bottom edge instead of hanging from the button. That is three things at
 * once:
 *
 *   1. a dropdown hanging from a kebab that lives in the corner of a row
 *      opens where there is no room —against the right edge, against the
 *      foot of the screen— and ends up clipped or stuck to the edge;
 *   2. the options land far from the thumb, at the top of the screen, when
 *      the finger is at the bottom;
 *   3. a calendar or a tree of concepts does not fit in the width of a
 *      dropdown, so they had to be narrowed until they stopped being
 *      usable.
 *
 * The sheet solves all three without the call site having to know anything:
 * the same `<Menu>` is drawn both ways.
 *
 * `list` and `search` are NOT included. A field that picks a value —a
 * dropdown in a form— has to stay attached to its field: separating it from
 * the place where the value is going to be written is losing sight of what
 * is being answered.
 */
export function Menu(props: MenuProps) {
  const m = withDefaults(props);
  const { label, kind, isFloating, trigger, children } = m;
  /** Opens as a sheet from the bottom instead of hanging from the button. */
  const isSheet = useIsMobile() && kind !== 'list' && kind !== 'search';
  const { isOpen, setIsOpen, box, anchor, measure } = useMenuState(isSheet);
  const close = (): void => setIsOpen(false);
  const content = typeof children === 'function' ? children(close) : children;

  function toggle(): void {
    if (isFloating && !isSheet) measure();
    if (!isOpen) m.onOpen?.();
    setIsOpen((wasOpen) => !wasOpen);
  }

  return (
    <div ref={box} className={cn('relative', m.boxClassName)}>
      {trigger ? (
        <button
          type="button"
          id={m.triggerId}
          onClick={toggle}
          aria-expanded={isOpen}
          aria-haspopup={ARIA[kind]}
          className={m.triggerClassName ?? 'flex items-center rounded-full outline-none'}
          {...m.triggerProps?.({ isOpen, close })}
        >
          {trigger({ isOpen })}
        </button>
      ) : (
        <MenuButton m={m} isOpen={isOpen} onClick={toggle} />
      )}

      {/* The sheet is mounted ALWAYS, open or closed: what slides cannot be
          rebuilt on every render, or it pops in instead of arriving. And only
          below the breakpoint, so that it costs nothing on the desktop. */}
      {isSheet && (
        <BottomSheet
          isOpen={isOpen}
          title={label}
          // Above a modal: a calendar or a kebab open FROM inside a modal,
          // and on the default layer they would be drawn behind the one that
          // asked for them.
          layer="z-[70]"
          onClose={close}
        >
          {content}
        </BottomSheet>
      )}

      {isOpen && !isSheet && (
        <MenuDropdown m={m} anchor={anchor}>
          {content}
        </MenuDropdown>
      )}
    </div>
  );
}

/**
 * The widths of a panel. They were a free class at every call site, and that
 * is how a hand-written `w-[min(…)]` ended up on one screen. A new one is
 * added here.
 *
 * | Width      | For                                                         |
 * | ---------- | ----------------------------------------------------------- |
 * | `sm`       | A short list of actions: sort, pending payments             |
 * | `md`       | The account menu in the rail                                |
 * | `base`     | The default                                                 |
 * | `lg`       | A tree with checkboxes: the classification filter           |
 * | `field`    | A form dropdown: its field, and never less than 12rem       |
 * | `content`  | Whatever the inside measures: the calendar of a single day  |
 * | `calendar` | The one of a range: on the phone, the calendar and its padding without running off; above the breakpoint, its content |
 */
const WIDTHS = {
  sm: 'w-56',
  md: 'w-60',
  base: 'w-64',
  lg: 'w-72',
  field: 'w-[max(12rem,100%)]',
  content: 'w-auto',
  calendar: 'w-[min(22rem,calc(100vw-2rem))] sm:w-auto',
} as const;

type Defaulted =
  | 'isIconOnly'
  | 'isActive'
  | 'align'
  | 'direction'
  | 'width'
  | 'kind'
  | 'isFloating'
  | 'variant'
  | 'isUnpadded'
  | 'hasOwnWidth';

/** The props of a menu with their defaults already applied. */
type MenuConfig = Omit<MenuProps, Defaulted> & Required<Pick<MenuProps, Defaulted>>;

// With `??` and not with a `...` of defaults: a call site that passes an
// explicit `undefined` has to get the default, as with the default value of
// a destructuring.
function withDefaults(p: MenuProps): MenuConfig {
  return {
    ...p,
    isIconOnly: p.isIconOnly ?? false,
    isActive: p.isActive ?? false,
    align: p.align ?? 'right',
    direction: p.direction ?? 'down',
    width: p.width ?? 'base',
    kind: p.kind ?? 'menu',
    isFloating: p.isFloating ?? false,
    variant: p.variant ?? 'tool',
    isUnpadded: p.isUnpadded ?? false,
    hasOwnWidth: p.hasOwnWidth ?? false,
  };
}

/** The button of a menu without a custom trigger: icon, name and chevron. */
function MenuButton({
  m,
  isOpen,
  onClick,
}: {
  m: MenuConfig;
  isOpen: boolean;
  onClick: () => void;
}) {
  const { label, Icon, isIconOnly, isActive, variant } = m;
  return (
    <Button
      type="button"
      variant={variant}
      size={isIconOnly ? 'sm-icon' : 'sm'}
      onClick={onClick}
      aria-expanded={isOpen}
      aria-haspopup={ARIA[m.kind]}
      // On when something in here is selected, or while it is open: the
      // variant itself resolves the style.
      aria-pressed={isActive || isOpen}
      aria-label={isIconOnly ? label : undefined}
      title={isIconOnly ? label : undefined}
    >
      {Icon && (
        <Icon
          className={cn(
            'size-4 shrink-0',
            // The kebab, fainter. It is a SECONDARY control: it lives in the
            // corner of every row and repeats as many times as there are
            // rows. At full ink, that column of dots weighs more than the
            // names, which are what people come to read. It goes here and
            // not at each call site so that the two kebabs —the cost
            // center's and the category's— cannot drift apart.
            variant === 'ghost' && isIconOnly && 'opacity-70',
          )}
          aria-hidden={true}
        />
      )}
      {!isIconOnly && <span className="truncate">{label}</span>}
      {!isIconOnly && (
        <ChevronDown
          className={cn(
            'size-3.5 shrink-0 opacity-60 transition-transform',
            isOpen && 'rotate-180',
          )}
          aria-hidden={true}
        />
      )}
    </Button>
  );
}

/** The panel that hangs from the button, on the desktop. */
function MenuDropdown({
  m,
  anchor,
  children,
}: {
  m: MenuConfig;
  anchor: Anchor | null;
  children: ReactNode;
}) {
  return (
    <div
      role={ROLE[m.kind]}
      aria-label={ROLE[m.kind] ? m.label : undefined}
      style={m.isFloating && anchor ? panelStyle(anchor, m.hasOwnWidth, m.align) : undefined}
      className={panelClass(m)}
    >
      {children}
    </div>
  );
}

/** The panel that hangs from the button: its surface, its origin and its width. */
function panelClass({ isFloating, hasOwnWidth, direction, align, width, isUnpadded }: MenuConfig) {
  return cn(
    'z-50 rounded-lg',
    // Floating, it has a height cap (`panelStyle`), so whatever does not fit
    // scrolls inside the panel instead of being clipped.
    isFloating ? 'overflow-y-auto overscroll-contain' : 'overflow-hidden',
    isUnpadded ? 'p-0' : 'p-1',
    FLOATING_SURFACE,
    SURGE,
    // Where it COMES FROM. A panel that grows from its own center comes
    // from nowhere; growing from the corner that touches the button, it
    // reads as the button unfolding it.
    isFloating
      ? 'origin-top'
      : direction === 'up'
        ? align === 'right'
          ? 'origin-bottom-right'
          : 'origin-bottom-left'
        : align === 'right'
          ? 'origin-top-right'
          : 'origin-top-left',
    isFloating ? 'fixed' : 'absolute',
    !isFloating && (direction === 'up' ? 'bottom-full mb-2' : 'top-full mt-2'),
    // Floating, the width comes from the trigger —the class would measure
    // against the window, which is nobody's box— unless the opposite is
    // asked for.
    (!isFloating || hasOwnWidth) && WIDTHS[width],
    'max-w-[calc(100vw-2rem)]',
    !isFloating && (align === 'right' ? 'right-0' : 'left-0'),
  );
}
/** The heading of a block of the menu: "Ordenar por", "Filtrar por"… */
export function MenuTitle({ children }: { children: ReactNode }) {
  return (
    <p className="px-2.5 pb-1 pt-1.5 text-xs font-semibold text-muted-foreground">{children}</p>
  );
}

/**
 * A line that crosses the WHOLE panel.
 *
 * The `-mx-1` cancels the panel's padding: a separator that respects the
 * options' margin does not separate two blocks, it looks like one more option
 * that came out wrong.
 */
export function MenuSeparator() {
  return <hr className="-mx-1 my-1 border-border" />;
}

/**
 * An option.
 *
 * The selected mark goes on the RIGHT and the background changes: the mark
 * alone gets lost when scanning the list by eye, and the background alone
 * does not tell the selected apart from what is under the cursor.
 */
export function MenuOption({
  Icon,
  isSelected = false,
  isDestructive = false,
  disabled: isDisabled = false,
  note,
  onClick,
  children,
}: {
  Icon?: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  isSelected?: boolean;
  /** Red. Reserved for what cannot be undone, like signing out. */
  isDestructive?: boolean;
  /**
   * Visible but not selectable.
   *
   * It is shown instead of hidden when the option EXISTS and is not there
   * yet: removing it would suggest the app cannot do that; dimmed, it says it
   * will. `note` is the why, in two words.
   */
  disabled?: boolean;
  note?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={isDisabled}
      aria-disabled={isDisabled}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors',
        // A menu row is 36 with a pointer. With a finger, 42.
        'movil:min-h-[42px]',
        isDisabled
          ? 'cursor-not-allowed text-muted-foreground opacity-60'
          : isDestructive
            ? 'font-medium text-destructive hover:bg-destructive/10'
            : // ── Selected and pointed at are NOT the same color ──────────────
              // The selected stays on `muted`, which is the still surface; what
              // is under the cursor goes to `accent`, which is the theme's one
              // for what responds. With `muted` on both, hovering over the
              // already-selected option changed nothing and the menu looked stuck.
              isSelected
              ? cn('bg-muted font-medium text-foreground', HIGHLIGHT)
              : cn('text-foreground', HIGHLIGHT),
      )}
    >
      {Icon && <Icon className="size-4 shrink-0 opacity-70" aria-hidden={true} />}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {note && <span className="shrink-0 text-xs text-muted-foreground">{note}</span>}
      {isSelected && <Check className="size-4 shrink-0 text-primary" aria-hidden={true} />}
    </button>
  );
}
