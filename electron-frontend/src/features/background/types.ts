export type BackgroundStyle =
  | 'classic_scene'
  | 'fuji_view'
  | 'torii_gate'
  | 'temple_reflection'
  | 'garden_bridge'
  | 'autumn_pond'
  | 'custom_upload'

export interface BackgroundSettingsFields {
  backgroundStyle: BackgroundStyle
  backgroundBlur: number
  customBackgroundDataUrl: string | null
  customBackgroundName: string | null
}
