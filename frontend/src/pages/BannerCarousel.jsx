import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

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

  if (!banners.length) return null

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
