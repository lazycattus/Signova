import type { Item } from './types.ts'
import type { Zone } from './bodymap.ts'
export type ReportRegion = Zone & { model_version: 'signova-body-v1' }

export type PatientAnswer = {
  kind: Item['kind']
  say: { en: string; bm: string }
  pain?: { score: number; site: string; side: string | null; type: string | null; onset: string | null; region?: ReportRegion }
}

/** Source messages only: never infer a diagnosis, a negative answer or AI wording. */
export function patientAnswers(items: Item[]): PatientAnswer[] {
  return items.filter(i => i.kind !== 'staff' && i.kind !== 'message').map(i => ({
    kind: i.kind, say: { en: i.say.en, bm: i.say.bm },
    ...(i.kind === 'pain' && i.meta && { pain: {
      score: i.meta.score, site: i.meta.site,
      side: i.meta.side ?? null, type: i.meta.type ?? null, onset: i.meta.onset ?? null,
      ...(i.reportedPain && { region: { model_version: 'signova-body-v1' as const, part: i.reportedPain.part, sub: i.reportedPain.sub, side: i.reportedPain.side } }),
    } }),
  }))
}
