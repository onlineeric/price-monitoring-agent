import { EmailScheduleSettings } from "./_components/email-schedule-settings";

export default function SettingsPage() {
  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      {/* Header */}
      <div>
        <h1 className="font-bold text-3xl">Settings</h1>
        <p className="text-muted-foreground">Configure email digest schedule and preferences</p>
      </div>

      {/* Email Schedule Settings */}
      <EmailScheduleSettings />
    </div>
  );
}
