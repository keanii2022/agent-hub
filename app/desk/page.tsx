import type { Metadata } from "next";
import { DeskScreen } from "./DeskScreen";
import { deskCss } from "./deskCss";

export const metadata: Metadata = {
  title: "Your desk · Agent Hub",
};

// /desk   everything waiting for the owner, and the log. An ordinary web page:
//         it only reads, from the hub's read-only routes.
export default function DeskPage() {
  return (
    <>
      <style>{deskCss}</style>
      <DeskScreen />
    </>
  );
}
