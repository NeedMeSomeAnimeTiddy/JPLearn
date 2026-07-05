type SessionInfo = {
 parentID?: string
 agent?: string
}

type SubagentInfo = {
 depth: number
 instanceNum: number
 agentName: string
}

function toTitleCase(value: string) {
 return value
 .replace(/[_-]+/g, " ")
 .replace(/\s+/g, " ")
 .trim()
 .replace(/\b\w/g, (char) => char.toUpperCase())
}

export default async function subagentStdoutReporter() {
 let rootSessionID: string | undefined

 const sessions = new Map<string, SessionInfo>()
 const subagents = new Map<string, SubagentInfo>()
 const instanceCounter = new Map<string, number>()

 const printedText = new Set ()
 const printedReasoning = new Set ()
 const toolStatus = new Map<string, string>()
 const lastToolSignatureBySession = new Map<string, string>()
 const finishedSessions = new Set ()

 const BOLD = "\u001b[1m"
 const RESET = "\u001b[0m"

 function isDescendantOfRoot(sessionID: string | undefined) {
 if (!sessionID || !rootSessionID) {
 return false
 }

 if (sessionID === rootSessionID) {
 return true
 }

 let cursor: string | undefined = sessionID
 const seen = new Set ()
 while (cursor && !seen.has(cursor)) {
 seen.add(cursor)
 const parentID = sessions.get(cursor)?.parentID
 if (!parentID) {
 return false
 }
 if (parentID === rootSessionID) {
 return true
 }
 cursor = parentID
 }

 return false
 }

 function getDepth(sessionID: string) {
 let depth = 0
 let cursor: string | undefined = sessionID
 const seen = new Set ()

 while (cursor && !seen.has(cursor)) {
 seen.add(cursor)
 const parentID = sessions.get(cursor)?.parentID
 if (!parentID || parentID === rootSessionID) {
 return depth + 1
 }
 depth += 1
 cursor = parentID
 }

 return depth + 1
 }

 function assignSubagentInfo(sessionID: string) {
 if (!rootSessionID || sessionID === rootSessionID) {
 return
 }

 const session = sessions.get(sessionID)
 if (!session?.parentID || !isDescendantOfRoot(sessionID)) {
 return
 }

 const agentName = toTitleCase(session.agent ?? "Subagent")
 const parentKey = `${session.parentID}:${agentName}`

 if (subagents.has(sessionID)) {
 const info = subagents.get(sessionID)
 if (!info) {
 return
 }

 if (info.agentName !== agentName) {
 const nextCount = (instanceCounter.get(parentKey) ?? 0) + 1
 instanceCounter.set(parentKey, nextCount)
 info.agentName = agentName
 info.instanceNum = nextCount
 }
 return
 }

 const nextCount = (instanceCounter.get(parentKey) ?? 0) + 1
 instanceCounter.set(parentKey, nextCount)

 subagents.set(sessionID, {
 depth: getDepth(sessionID),
 instanceNum: nextCount,
 agentName,
 })
 }

 function prefixFor(sessionID: string) {
 const info = subagents.get(sessionID)
 if (!info) {
 return ""
 }
 return `${info.agentName} ${info.instanceNum}: `
 }

 function getField(input: Record<string, unknown>, keys: string[]) {
 for (const key of keys) {
 const value = input[key]
 if (typeof value === "string" && value.trim()) {
 return value.trim()
 }
 }
 return undefined
 }

 function summarizeToolInput(tool: string, rawInput: unknown) {
 const input = rawInput && typeof rawInput === "object" ? (rawInput as Record<string, unknown>) : {}

 if (tool === "read") {
 return getField(input, ["filePath", "path"])
 }
 if (tool === "bash") {
 return getField(input, ["description", "command"])
 }
 if (tool === "skill") {
 return getField(input, ["name"])
 }
 if (tool === "glob") {
 return getField(input, ["pattern", "path"])
 }
 if (tool === "grep") {
 return getField(input, ["pattern", "include", "path"])
 }
 if (tool === "task") {
 return getField(input, ["description", "subagent_type", "prompt"])
 }
 if (tool === "write" || tool === "edit") {
 return getField(input, ["filePath", "path"])
 }

 return (
 getField(input, ["description", "name", "filePath", "path", "pattern", "query", "url", "prompt", "command"]) ??
 undefined
 )
 }

 return {
 event: async ({ event }: { event: any }) => {
 if (event.type === "session.created") {
 const info = event.properties?.info
 if (!info?.id) {
 return
 }

 sessions.set(info.id, {
 parentID: info.parentID,
 })

 if (!rootSessionID && !info.parentID) {
 rootSessionID = info.id
 return
 }

 assignSubagentInfo(info.id)
 return
 }

 if (event.type === "message.updated") {
 const info = event.properties?.info
 if (!info?.sessionID || info.role !== "assistant") {
 return
 }

 const session = sessions.get(info.sessionID)
 if (!session) {
 sessions.set(info.sessionID, { agent: info.agent })
 } else if (!session.agent && info.agent) {
 session.agent = info.agent
 }

 assignSubagentInfo(info.sessionID)
 return
 }

 if (event.type !== "message.part.updated") {
 if (event.type === "session.status") {
 const statusSessionID = event.properties?.sessionID
 const statusType = event.properties?.status?.type
 if (
 statusSessionID &&
 statusType === "idle" &&
 subagents.has(statusSessionID) &&
 !finishedSessions.has(statusSessionID)
 ) {
 finishedSessions.add(statusSessionID)
 const info = subagents.get(statusSessionID)
 if (info) {
 process.stdout.write(`**** [${info.agentName.toUpperCase()} FINISHED] ****\n`)
 }
 }
 }
 return
 }

 const part = event.properties?.part
 const sessionID = part?.sessionID
 if (!sessionID || !isDescendantOfRoot(sessionID) || !subagents.has(sessionID)) {
 return
 }

 const prefix = prefixFor(sessionID)
 if (!prefix) {
 return
 }

 if (part.type === "tool") {
 const key = String(part.id)
 const nextStatus = String(part.state?.status ?? "")
 const prevStatus = toolStatus.get(key)

 if (nextStatus && nextStatus !== prevStatus && (nextStatus === "running" || nextStatus === "completed")) {
 toolStatus.set(key, nextStatus)
 const detail = summarizeToolInput(String(part.tool), part.state?.input)
 const signature = `${part.tool}|${detail ?? ""}`
 const prevSignature = lastToolSignatureBySession.get(sessionID)
 if (prevSignature !== signature) {
 const detailText = detail ? ` ${BOLD}${detail}${RESET}` : ""
 process.stdout.write(`${prefix}-> ${part.tool}${detailText}\n`)
 lastToolSignatureBySession.set(sessionID, signature)
 }
 }
 return
 }

 if (part.type === "text" && part.time?.end) {
 lastToolSignatureBySession.delete(sessionID)
 const text = String(part.text ?? "").trim()
 if (!text) {
 return
 }
 const key = `${part.id}:${part.time.end}`
 if (printedText.has(key)) {
 return
 }
 printedText.add(key)
 process.stdout.write(`${prefix}${text}\n`)
 return
 }

 if (part.type === "reasoning" && part.time?.end) {
 lastToolSignatureBySession.delete(sessionID)
 const text = String(part.text ?? "").trim()
 if (!text) {
 return
 }
 const key = `${part.id}:${part.time.end}`
 if (printedReasoning.has(key)) {
 return
 }
 printedReasoning.add(key)
 process.stdout.write(`${prefix}Thinking: ${text}\n`)
 }
 },
 }
}
