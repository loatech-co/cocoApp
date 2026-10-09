/** A menu option closes the menu and then does its own thing. */
export function afterClose(close: () => void, action: () => void): () => void {
  return () => {
    close();
    action();
  };
}
