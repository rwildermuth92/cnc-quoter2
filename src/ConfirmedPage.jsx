export default function ConfirmedPage() {
  return (
    <div style={{
      maxWidth: 400, margin: '100px auto',
      textAlign: 'center', fontFamily: 'sans-serif'
    }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
      <h2>Email Confirmed!</h2>
      <p style={{ color: '#888' }}>
        Your email has been verified. You can now return to the app and sign in.
      </p>
      <a href="https://cnc-quoter2.vercel.app" style={{
        display: 'inline-block', marginTop: 24,
        padding: '10px 24px', background: '#f59e0b',
        color: '#000', borderRadius: 4,
        textDecoration: 'none', fontWeight: 'bold'
      }}>
        Go to App →
      </a>
    </div>
  )
}