import {
  TrendingUp,
  PackagePlus,
  Boxes,
  Hourglass,
  Warehouse,
} from 'lucide-react';
import { Skeleton } from '../ui';

// ─── Standard, constant section labels — hindi ito galing sa AI at hindi
// dapat nagbabago. Ang AI lang ang nagbibigay ng laman (title/desc) ng
// bawat recommendation sa loob ng bawat section. Naging 2 categories na
// lang (dating 3): "salesOptimization" ngayon ay kasama na rin ang bundle
// promotions logic, at "wasteReduction" ay naging "inventoryOptimization"
// (Expiry Management + Stock & Waste Control). Wala nang per-timeframe
// subtitles. Bawat section may sariling "tag" color para makilala agad —
// pareho parin sila ng brand's warm brown/terracotta family kaya hindi
// kakaiba sa ibang parte ng dashboard. ───
const SECTIONS = [
  {
    key: 'salesOptimization',
    label: 'Sales Optimization',
    icon: TrendingUp,
    accent: '#C1694A',
    slots: ['improvement', 'bundle'],
  },
  {
    key: 'inventoryOptimization',
    label: 'Inventory Optimization',
    icon: PackagePlus,
    accent: '#8B6F3E',
    slots: ['expiry', 'stock'],
  },
];

// Fixed labels para sa BAWAT item ng dalawang categories. Hindi galing sa AI —
// ang AI lang ang nagbibigay ng "kind" at ng title/desc. Ang label na
// nakikita ng user ay laging isa sa apat na ito:
//   Sales Optimization     -> "improvement" (Sales Improvement), "bundle" (Product Bundling)
//   Inventory Optimization -> "expiry" (Expiry Management),     "stock"  (Stock & Waste Control)
// Ang "order" ay posisyon sa loob ng sarili nitong section.
const ITEM_KINDS = {
  improvement: {
    label: 'Sales Improvement',
    icon: TrendingUp,
    order: 0,
    emptyText: 'No sales improvement tip yet.',
  },
  bundle: {
    label: 'Product Bundling',
    icon: Boxes,
    order: 1,
    emptyText: 'Not enough sales history to suggest a bundle yet.',
  },
  expiry: {
    label: 'Expiry Management',
    icon: Hourglass,
    order: 0,
    emptyText: 'No items close to expiring right now.',
  },
  stock: {
    label: 'Stock & Waste Control',
    icon: Warehouse,
    order: 1,
    emptyText: 'No stock problems or waste logged in the last 30 days.',
  },
};

// Bawat section ay laging may DALAWANG fixed na slot (tingnan ang
// section.slots). Hinahanap ang item ayon sa "kind"; kung walang "kind" ang
// data, ayon sa posisyon (0 = unang slot, 1 = pangalawang slot).
function buildSlots(items, slotKinds) {
  const list = Array.isArray(items) ? items : [];
  const hasKinds = list.some((i) => slotKinds.includes(i?.kind));
  return slotKinds.map((kind, index) => ({
    kind,
    item: (hasKinds ? list.find((i) => i?.kind === kind) : list[index]) || null,
  }));
}

function RecommendationItem({ ins, accent, kind }) {
  const kindMeta = ITEM_KINDS[kind || ins.kind];
  const KindIcon = kindMeta?.icon;

  return (
    <div className="relative flex gap-3 py-4 pl-3.5 first:pt-0 last:pb-0 max-w-[64ch]">
      <span
        className="absolute left-0 top-1 bottom-1 w-[3px] rounded-full"
        style={{ backgroundColor: accent }}
      />
      <div className="min-w-0">
        {kindMeta && (
          <span
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border mb-2"
            style={{ color: accent, borderColor: accent + '55', backgroundColor: '#fff' }}
          >
            <KindIcon size={12} className="shrink-0" />
            {kindMeta.label}
          </span>
        )}
        <h4 className="text-sm font-bold text-[#3d2410] leading-snug mb-1.5">
          {ins.title}
        </h4>
        <p className="text-sm text-[#5C3317] leading-7">{ins.desc}</p>
      </div>
    </div>
  );
}

function EmptySlot({ kind, accent }) {
  const meta = ITEM_KINDS[kind];
  const KindIcon = meta.icon;
  return (
    <div className="relative flex gap-3 py-4 pl-3.5 first:pt-0 last:pb-0 max-w-[64ch]">
      <span
        className="absolute left-0 top-1 bottom-1 w-[3px] rounded-full opacity-40"
        style={{ backgroundColor: accent }}
      />
      <div className="min-w-0">
        <span
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border mb-2"
          style={{ color: accent, borderColor: accent + '55', backgroundColor: '#fff' }}
        >
          <KindIcon size={12} className="shrink-0" />
          {meta.label}
        </span>
        <p className="text-sm text-[#5C3317]/70 leading-7">{meta.emptyText}</p>
      </div>
    </div>
  );
}

function Note({ section, items, isLoading = false }) {
  const Icon = section.icon;
  const isEmpty = !items || items.length === 0;
  const count = items?.length || 0;
  const slots = !isEmpty && section.slots ? buildSlots(items, section.slots) : null;

  return (
    <div className="relative rounded-xl border border-brand-100 bg-brand-50/40 overflow-hidden transition-shadow duration-200 hover:shadow-md">
      {/* pinned-tag strip — the one nod to "pinned note", kept flat and thin */}
      <div
        className="absolute top-0 left-0 right-0 h-[3px]"
        style={{ backgroundColor: section.accent }}
      />

      <div className="p-4 pt-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <Icon size={16} className="text-[#5C3317] shrink-0" />
            <h3 className="text-sm font-bold text-[#3d2410] truncate">{section.label}</h3>
          </div>
          {!isEmpty && (
            <span
              className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border"
              style={{ color: section.accent, borderColor: section.accent + '55', backgroundColor: '#fff' }}
            >
              {count} {count === 1 ? 'tip' : 'tips'}
            </span>
          )}
        </div>

        {isLoading ? (
          <div role="status" aria-label={`Loading ${section.label.toLowerCase()}`} aria-live="polite" className="space-y-3 py-2">
            <Skeleton h="h-3.5" />
            <Skeleton w="w-11/12" h="h-3.5" />
            <Skeleton w="w-4/5" h="h-3.5" />
          </div>
        ) : isEmpty ? (
          <div
            role="status"
            className="flex items-center justify-center text-sm text-[#5C3317] border border-dashed border-[#e7ded4] rounded-lg text-center px-6 py-6"
          >
            Nothing pinned here yet.
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-[#f1ece4]">
            {slots
              ? slots.map(({ kind, item }) =>
                  item ? (
                    <RecommendationItem key={kind} ins={item} kind={kind} accent={section.accent} />
                  ) : (
                    <EmptySlot key={kind} kind={kind} accent={section.accent} />
                  )
                )
              : items.map((ins, i) => (
                  <RecommendationItem key={i} ins={ins} accent={section.accent} />
                ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ActionableRecommendation({ recommendations = {}, isLoading = false }) {
  const {
    salesOptimization = [],
    inventoryOptimization = [],
  } = recommendations;

  // Laging nauuna ang unang slot ng section (Sales Improvement / Expiry Management)
  // bago ang pangalawa (Product Bundling / Stock & Waste Control). Stable sort; ang item
  // na walang "kind" ay nananatili sa orihinal na posisyon.
  const byKindOrder = (a, b) =>
    (ITEM_KINDS[a?.kind]?.order ?? 0) - (ITEM_KINDS[b?.kind]?.order ?? 0);

  const dataByKey = {
    salesOptimization: [...salesOptimization].sort(byKindOrder),
    inventoryOptimization: [...inventoryOptimization].sort(byKindOrder),
  };

  return (
    // Binago ang bg-white to bg-[#fdfbf9], p-5 to p-4, at tinanggal ang shadow-sm para pumantay sa Forecasting wrapper[cite: 2]
    <div className="w-full p-4 bg-[#fdfbf9] border border-[#e7ded4] rounded-xl flex flex-col h-full">
      {/* One row on desktop, stacked (2 rows) on mobile[cite: 2] */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
        {SECTIONS.map((section) => (
          <Note
            key={section.key}
            section={section}
            items={dataByKey[section.key]}
            isLoading={isLoading}
          />
        ))}
      </div>
    </div>
  );
}