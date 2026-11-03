// Temporary "coming soon" box. Delete it from a page once the real design is in.
export default function PagePlaceholder({ title, description }) {
  return (
    <section className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-8 text-center">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-slate-500">{description}</p>
      <p className="mt-4 text-sm text-slate-400">Placeholder page. Replace this with the real design.</p>
    </section>
  )
}
