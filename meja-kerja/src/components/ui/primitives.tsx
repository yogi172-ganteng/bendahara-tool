import * as Dialog from "@radix-ui/react-dialog";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import * as SelectPrimitive from "@radix-ui/react-select";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { Check, ChevronDown, X } from "lucide-react";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-lg border border-line bg-surface text-ink shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center justify-between gap-3 px-5 pt-5", className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-base font-semibold tracking-tight", className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 pb-5 pt-4", className)} {...props} />;
}

const tones = {
  solid: "bg-primary text-white hover:bg-navy",
  outline: "border border-line bg-surface text-ink hover:bg-canvas",
  ghost: "text-muted hover:bg-canvas hover:text-ink",
} as const;

export function Button({
  className,
  tone = "outline",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: keyof typeof tones }) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-md px-3.5 text-sm font-semibold transition-colors disabled:opacity-50",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

const badgeTones = {
  outline: "border-line bg-surface text-muted",
  primary: "border-transparent bg-primary-soft text-primary",
  in: "border-transparent bg-in-soft text-in",
  out: "border-transparent bg-out-soft text-out",
  warn: "border-transparent bg-warn-soft text-warn",
} as const;

export function Badge({
  className,
  tone = "outline",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof badgeTones }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        badgeTones[tone],
        className,
      )}
      {...props}
    />
  );
}

export function Progress({ value, className }: { value: number; className?: string }) {
  const safe = Math.max(0, Math.min(100, value));
  return (
    <ProgressPrimitive.Root
      value={safe}
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-line", className)}
    >
      <ProgressPrimitive.Indicator
        className="h-full w-full bg-primary transition-transform duration-300"
        style={{ transform: `translateX(-${100 - safe}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}

export function Select({
  value,
  onValueChange,
  options,
  label,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: { value: string; label: string }[];
  label: string;
}) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange}>
      <SelectPrimitive.Trigger
        aria-label={label}
        className="inline-flex h-10 min-w-44 items-center justify-between gap-2 rounded-md border border-line bg-surface px-3 text-sm font-medium text-ink"
      >
        <SelectPrimitive.Value />
        <SelectPrimitive.Icon>
          <ChevronDown className="size-4 text-muted" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          className="z-50 min-w-44 overflow-hidden rounded-md border border-line bg-surface shadow-lg"
        >
          <SelectPrimitive.Viewport className="p-1">
            {options.map((opt) => (
              <SelectPrimitive.Item
                key={opt.value}
                value={opt.value}
                className="flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-sm outline-none data-[highlighted]:bg-canvas"
              >
                <SelectPrimitive.ItemText>{opt.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator>
                  <Check className="size-4 text-primary" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

export const Tabs = TabsPrimitive.Root;
export const TabsList = ({ className, ...props }: TabsPrimitive.TabsListProps) => (
  <TabsPrimitive.List
    className={cn("inline-flex rounded-md border border-line bg-surface p-1", className)}
    {...props}
  />
);
export const TabsTrigger = ({ className, ...props }: TabsPrimitive.TabsTriggerProps) => (
  <TabsPrimitive.Trigger
    className={cn(
      "rounded-md px-3 py-2 text-sm font-semibold text-muted transition-colors data-[state=active]:bg-primary-soft data-[state=active]:text-primary",
      className,
    )}
    {...props}
  />
);

export function Modal({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-line bg-surface p-5 shadow-xl">
          <div className="mb-4 flex items-start justify-between gap-3">
            <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
            <Dialog.Close className="rounded-md p-1 text-muted hover:bg-canvas" aria-label="Tutup">
              <X className="size-4" />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

export const fieldClass =
  "h-10 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-primary";
