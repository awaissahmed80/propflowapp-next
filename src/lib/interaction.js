// Row/card click handler: ignores clicks on controls, menus (incl. portalled ones) and text selection
export function isInteractiveClick(event) {
  if (window.getSelection()?.toString()) return true
  return Boolean(event.target.closest("a, button, input, select, textarea, [role=menu], [role=menuitem], [role=menuitemcheckbox], [data-slot=dropdown-menu-content]"))
}
