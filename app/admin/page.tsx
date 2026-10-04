import AdminTabs from "@/components/admin/AdminTabs";

export default function AdminPage() {
  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex items-center justify-between pb-1">
        <div>
          <span className="text-[0.65rem] font-bold tracking-[0.22em] uppercase text-roast block">
            Management Portal
          </span>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-espresso">
            Admin Dashboard
          </h1>
        </div>
      </div>
      <AdminTabs />
    </div>
  );
}
