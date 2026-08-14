import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

const TV_CONFIG = {
  header:        { widget: 'ticker-tape',      height: 46  },
  footer:        { widget: 'ticker-tape',      height: 46  },
  dashboard_top: { widget: 'market-overview',  height: 220 },
  sidebar:       { widget: 'market-overview',  height: 400 },
}

function TradingViewFallback({ position }) {
  const ref = useRef(null)
  const cfg = TV_CONFIG[position] || TV_CONFIG.header

  useEffect(() => {
    if (!ref.current) return
    // TradingView exige un div interno con esta clase exacta antes del script — sin esto el widget nunca se pinta
    ref.current.innerHTML = '<div class="tradingview-widget-container__widget"></div>'
    const script = document.createElement('script')
    script.src = `https://s3.tradingview.com/external-embedding/embed-widget-${cfg.widget}.js`
    script.async = true
    script.innerHTML = JSON.stringify(
      cfg.widget === 'ticker-tape'
        ? { symbols: [{ proName: 'FX_IDC:USDDOP', title: 'USD/DOP' }, { proName: 'FX_IDC:USDBRL', title: 'USD/BRL' }, { proName: 'FOREXCOM:DXY', title: 'DXY' }], colorTheme: 'light', isTransparent: false, displayMode: 'compact', locale: 'es' }
        : { colorTheme: 'light', dateRange: '1D', showChart: false, locale: 'es', width: '100%', height: cfg.height, tabs: [{ title: 'Divisas', symbols: [{ s: 'FX_IDC:USDDOP', d: 'USD/DOP' }, { s: 'FX_IDC:USDBRL', d: 'USD/BRL' }] }] }
    )
    ref.current.appendChild(script)
  }, [position])

  return (
    <div className="w-full overflow-hidden rounded-xl border border-hpa-slate-2 bg-white relative" style={{ height: cfg.height }}>
      <div ref={ref} className="tradingview-widget-container w-full h-full" />
      <span className="absolute top-1 right-2 text-2xs text-hpa-slate-4 bg-white/80 px-1 rounded">Espacio disponible para publicidad</span>
    </div>
  )
}

export default function BannerCarousel({ position = 'header' }) {
  const [banners, setBanners] = useState([])
  const [current, setCurrent] = useState(0)
  useEffect(() => {
    async function load() {
      const today = new Date().toISOString().split('T')[0]
      const { data } = await supabase
        .from('ad_banners')
        .select('*, ad_spaces(position)')
        .eq('status', 'active')
        .eq('payment_status', 'paid')
        .lte('start_date', today)
        .gte('end_date', today)
      if (data) {
        const filtered = data.filter(b => b.ad_spaces?.position === position)
        setBanners(filtered)
      }
    }
    load()
  }, [position])
  useEffect(() => {
    if (banners.length <= 1) return
    const timer = setInterval(() => {
      setCurrent(c => (c + 1) % banners.length)
    }, 5000)
    return () => clearInterval(timer)
  }, [banners])
  if (!banners.length) return <TradingViewFallback position={position} />
  const banner = banners[current]
  const heights = {
    header: 'h-16',
    dashboard_top: 'h-24',
    footer: 'h-16',
    sidebar: 'h-48'
  }
  return (
    <div className={`relative w-full ${heights[position] || 'h-16'} overflow-hidden rounded-xl`}>
      {banners.map((b, i) => (
        <a key={b.id} href={b.link_url || '#'} target="_blank" rel="noreferrer"
          className={`absolute inset-0 transition-opacity duration-700 ${i === current ? 'opacity-100' : 'opacity-0'}`}>
          {b.image_url ? (
            <img src={b.image_url} alt={b.alt_text || b.advertiser_name}
              className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-r from-hpa-700 to-hpa-600 flex items-center justify-center">
              <p className="text-white font-semibold text-sm">{b.company_name || b.advertiser_name}</p>
            </div>
          )}
        </a>
      ))}
      {banners.length > 1 && (
        <div className="absolute bottom-1 right-2 flex gap-1">
          {banners.map((_, i) => (
            <button key={i} onClick={() => setCurrent(i)}
              className={`w-1.5 h-1.5 rounded-full transition-all ${i === current ? 'bg-white' : 'bg-white/40'}`} />
          ))}
        </div>
      )}
      <div className="absolute top-1 right-2">
        <span className="text-2xs text-white/50 bg-black/20 px-1 rounded">Publicidad</span>
      </div>
    </div>
  )
}