export function getGamesHubEntrance(shouldReduceMotion: boolean) {
  return {
    animate: { opacity: 1, y: 0 },
    initial: shouldReduceMotion ? false : { opacity: 0, y: 12 },
    transition: { duration: 0.2 },
  }
}
