export default function PracticeLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      {/* <h1>This Layout is injected inside main layout</h1> */}
      {children}
    </>
  );
}
