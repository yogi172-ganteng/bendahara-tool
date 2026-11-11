import { createFileRoute } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { MejaKerja } from "@/components/meja-kerja";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <>
      <MejaKerja />
      <Toaster position="top-center" richColors />
    </>
  );
}
