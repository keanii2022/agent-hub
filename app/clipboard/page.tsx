import type { Metadata } from "next";
import { deskCss } from "../desk/deskCss";
import { ClipboardScreen } from "./ClipboardScreen";
import { clipboardCss } from "./clipboardCss";

export const metadata: Metadata = {
  title: "Your build board · Agent Hub",
};

// /clipboard   the clipboard from the human's desk: how far each project's plan
//              has got. An ordinary web page in the desk's own look. It only
//              reads, from the hub's read-only route.
export default function ClipboardPage() {
  return (
    <>
      <style>{deskCss}</style>
      <style>{clipboardCss}</style>
      <ClipboardScreen />
    </>
  );
}
