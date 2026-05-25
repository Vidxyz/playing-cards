export function Toast({ message }: { message: string }) {
  return (
    <div
      className="card-slide"
      style={{
        position: 'fixed',
        top: 60,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 600,
        background: 'rgba(220,38,38,0.93)',
        color: '#fff',
        padding: '9px 18px',
        borderRadius: 12,
        fontSize: 13,
        fontWeight: 700,
        boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
        letterSpacing: '0.01em',
      }}
    >
      {message}
    </div>
  )
}
