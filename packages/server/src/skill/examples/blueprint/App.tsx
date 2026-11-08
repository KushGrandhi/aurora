import Drawing from "./Drawing";

// Split story: the drawing holds one half of the screen; the steps scroll in the other. It sits centred on the
// page's ground, like a sheet on a drafting table.
export default function App() {
  return (
    <div className="flex h-screen items-center justify-center bg-page p-6 md:p-12">
      <div className="w-full max-w-3xl"><Drawing /></div>
    </div>
  );
}
