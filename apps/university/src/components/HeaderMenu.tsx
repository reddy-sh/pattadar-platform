import CheckRounded from '@mui/icons-material/CheckRounded';
import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

export interface HeaderMenuItem {
  label: string;
  icon?: ReactNode;
  /** Shown as the ticked choice (a radio item) when defined. */
  selected?: boolean;
  /** A rule above this item. */
  rule?: boolean;
  onSelect: () => void;
}

/** The header's icon-triggered menus (appearance, account), drawn the way the
 *  Pattadar app's top bar draws them: a round trigger, a small popup list,
 *  arrow keys inside it, Escape or a click elsewhere closing it and returning
 *  focus to the trigger. */
export function HeaderMenu({ label, trigger, triggerClassName = 'header-icon', heading, items }: {
  label: string;
  trigger: ReactNode;
  triggerClassName?: string;
  heading?: ReactNode;
  items: HeaderMenuItem[];
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>('[role^="menuitem"]')?.focus();
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const entries = [...(listRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];
    const at = entries.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'Escape') { event.preventDefault(); close(true); }
    else if (event.key === 'Tab') setOpen(false);
    else if (event.key === 'ArrowDown') { event.preventDefault(); entries[(at + 1) % entries.length]?.focus(); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); entries[(at - 1 + entries.length) % entries.length]?.focus(); }
    else if (event.key === 'Home') { event.preventDefault(); entries[0]?.focus(); }
    else if (event.key === 'End') { event.preventDefault(); entries[entries.length - 1]?.focus(); }
  };

  return (
    <div className="header-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((was) => !was)}
      >
        {trigger}
      </button>
      {open ? (
        <div className="header-menu__list" role="menu" id={menuId} aria-label={label} ref={listRef} onKeyDown={onKeyDown}>
          {heading ? <div className="header-menu__heading">{heading}</div> : null}
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role={item.selected === undefined ? 'menuitem' : 'menuitemradio'}
              aria-checked={item.selected === undefined ? undefined : item.selected}
              tabIndex={-1}
              className={[
                'header-menu__item',
                item.rule ? 'header-menu__item--rule' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => { close(true); item.onSelect(); }}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.selected ? <CheckRounded className="header-menu__tick" aria-hidden /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
