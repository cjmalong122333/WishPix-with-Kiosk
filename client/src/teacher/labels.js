// Display names for values stored by the server.
export const ACTIVITY_NAMES = { color_create: 'Color & Create', trace_learn: 'Trace & Learn', free_play: 'Free Play' }
export const SAFETY_NAMES = { strict: 'STRICT', standard: 'STANDARD', custom: 'CUSTOM' }

export const activityName = (session) => ACTIVITY_NAMES[session?.activity_type] ?? ''
