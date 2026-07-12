/** Plovoucí tlačítko tisku — v @media print skryté. */
export default function PrintButton() {
  return (
    <>
      <style>{`
        .print-btn{position:fixed;top:16px;right:16px;z-index:100;background:#161616;color:#fff;border:none;border-radius:8px;padding:10px 20px;font-size:15px;font-weight:600;cursor:pointer;font-family:Arial,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.15)}
        .print-btn:hover{background:#161616}
        @media print{.print-btn{display:none}}
      `}</style>
      <button className="print-btn" onClick={() => window.print()}>
        Tisknout
      </button>
    </>
  );
}
