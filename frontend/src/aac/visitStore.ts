import { create } from 'zustand'
import type { Lang } from './lib/types.ts'

export type RegistrationDraft = { full_name: string; ic_number: string; preferred_language: Lang; needs_help: boolean }
export type CurrentVisit = { id: string; patient_id: string; patient_name: string; preferred_language: Lang; queue_number: string; visit_date: string; consultation_room: string | null }
const emptyDraft = (): RegistrationDraft => ({ full_name: '', ic_number: '', preferred_language: 'en', needs_help: false })

type VisitState = {
  draft: RegistrationDraft
  registrationPhase: 'edit' | 'review' | 'waiting' | 'nurse' | 'registered'
  current: CurrentVisit | null
  registrationOpen: boolean
  summaryOpen: boolean
  editPainUid: number | null
  registrationRequestId: string
  confirmation: { fingerprint: string; version: number | null; requestId: string } | null
  summaryRequest: { fingerprint: string; id: string } | null
  set: (patch: Partial<Omit<VisitState, 'set' | 'reset'>>) => void
  reset: () => void
}

export const useVisit = create<VisitState>((set) => ({
  draft: emptyDraft(), registrationPhase: 'edit', current: null,
  registrationOpen: false, summaryOpen: false, editPainUid: null,
  registrationRequestId: crypto.randomUUID(), confirmation: null, summaryRequest: null,
  set: patch => set(patch),
  reset: () => set({ draft: emptyDraft(), registrationPhase: 'edit', current: null,
    registrationOpen: false, summaryOpen: false, editPainUid: null,
    registrationRequestId: crypto.randomUUID(), confirmation: null, summaryRequest: null }),
}))
