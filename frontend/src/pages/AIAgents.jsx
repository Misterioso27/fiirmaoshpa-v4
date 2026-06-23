import { useState, useEffect, useRef } from 'react'
import { Bot, Send, CheckCircle, XCircle, ChevronRight, Loader2 } from 'lucide-react'
import { db, fmtDateTime } from '@/lib/supabase'
import { StatusBadge, Empty, Spinner, Tabs } from '@/components/ui'

const AGENT_COLORS = {
  core: 'bg-hpa-700', credito: 'bg-emerald-600', cobranza: 'bg-red-500',
  tesoreria: 'bg-amber-500', auditoria: 'bg-purple-600', gerencia: 'bg-slate-700',
  rrhh: 'bg-pink-500', atencion: 'bg-blue-500'
}

function AgentCard({ agent, onSelect, active }) {
  return (
    <div onClick={() => onSelect(agent)}
      className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${active ? 'border-hpa-700 bg-hpa-700/5' : 'border-hpa-slate-2 hover:border-hpa-700/30 bg-white'}`}>
      <div className="flex items-center gap-3 mb-2">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white text-lg flex-shrink-0 ${AGENT_COLORS[agent.role]||'bg-hpa-700'}`}>
          {agent.avatar_emoji}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-sm text-hpa-slate-9 truncate">{agent.name}</p>
          <p className="text-xs text-hpa-slate-5 capitalize">{agent.role}</p>
        </div>
      </div>
      <p className="text-xs text-hpa-slate-6 line-clamp-2">{agent.description}</p>
      <div className="flex items-center justify-between mt-3">
        <span className={`badge ${agent.is_active ? 'badge-green' : 'badge-gray'}`}>
          {agent.is_active ? 'Activo' : 'Inactivo'}
        </span>
        <span className="text-xs text-hpa-slate-5">{agent.total_conversations} conv.</span>
      </div>
    </div>
  )
}

function ChatMessage({ msg }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-bold ${isUser ? 'bg-hpa-700' : 'bg-hpa-gold'}`}>
        {isUser ? 'U' : '🤖'}
      </div>
      <div className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm ${isUser ? 'bg-hpa-700 text-white rounded-tr-sm' : 'bg-white border border-hpa-slate-2 text-hpa-slate-8 rounded-tl-sm'}`}>
        {msg.content}
      </div>
    </div>
  )
}

export default function AIAgents() {
  const [agents, setAgents]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [selected, setSelected]     = useState(null)
  const [messages, setMessages]     = useState([])
  const [input, setInput]           = useState('')
  const [sending, setSending]       = useState(false)
  const [decisions, setDecisions]   = useState([])
  const [tab, setTab]               = useState('agents')
  const bottomRef = useRef(null)

  useEffect(() => { loadAgents() }, [])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function loadAgents() {
    setLoading(true)
    try {
      const data = await api.get('/ai/agents')
      setAgents(data.agents || [])
    } catch {}
    setLoading(false)
  }

  async function loadDecisions() {
    try {
      const data = await api.get('/ai/decisions?status=pending')
      setDecisions(data.decisions || [])
    } catch {}
  }

  function selectAgent(agent) {
    setSelected(agent)
    setMessages([{
      role: 'assistant',
      content: `Hola, soy ${agent.name}. ${agent.description} ¿En qué puedo ayudarte?`
    }])
  }

  async function sendMessage() {
    if (!input.trim() || !selected || sending) return
    const userMsg = { role: 'user', content: input }
    setMessages(m => [...m, userMsg])
    setInput('')
    setSending(true)
    try {
      const res = await api.post(`/ai/agents/${selected.id}/chat`, {
        message: input,
        history: messages.slice(-10)
      })
      setMessages(m => [...m, { role: 'assistant', content: res.response }])
    } catch (err) {
      setMessages(m => [...m, { role: 'assistant', content: 'Lo siento, ocurrió un error. Por favor intenta de nuevo.' }])
    }
    setSending(false)
  }

  async function approveDecision(id) {
    try {
      await api.put(`/ai/decisions/${id}/approve`, { notes: 'Aprobado desde panel' })
      loadDecisions()
    } catch (err) { alert(err.message) }
  }

  async function rejectDecision(id) {
    try {
      await api.put(`/ai/decisions/${id}/reject`, { notes: 'Rechazado desde panel' })
      loadDecisions()
    } catch (err) { alert(err.message) }
  }

  const TABS = [
    { id: 'agents',    label: 'Agentes' },
    { id: 'decisions', label: 'Aprobaciones Pendientes' },
  ]

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h2 className="text-xl font-bold text-hpa-slate-9">FIIRMAOSHPA AI</h2>
        <p className="text-xs text-hpa-slate-5 mt-0.5">Centro de orquestación multiagente</p>
      </div>

      <div className="card p-0">
        <div className="px-5 pt-4 border-b border-hpa-slate-2">
          <Tabs tabs={TABS} active={tab} onChange={t => { setTab(t); if(t==='decisions') loadDecisions() }} />
        </div>

        {tab === 'agents' && (
          <div className="flex h-[600px]">
            {/* Agent list */}
            <div className="w-80 border-r border-hpa-slate-2 p-4 overflow-y-auto space-y-3 flex-shrink-0">
              {loading ? <div className="flex justify-center py-8"><Spinner size={20} /></div>
              : agents.map(a => (
                <AgentCard key={a.id} agent={a} onSelect={selectAgent} active={selected?.id === a.id} />
              ))}
            </div>

            {/* Chat area */}
            <div className="flex-1 flex flex-col">
              {!selected ? (
                <div className="flex-1 flex items-center justify-center">
                  <Empty icon={Bot} title="Selecciona un agente"
                    desc="Elige uno de los 8 agentes FIIRMAOSHPA para iniciar una conversación" />
                </div>
              ) : (
                <>
                  {/* Chat header */}
                  <div className="p-4 border-b border-hpa-slate-2 flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-white ${AGENT_COLORS[selected.role]||'bg-hpa-700'}`}>
                      {selected.avatar_emoji}
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-hpa-slate-9">{selected.name}</p>
                      <p className="text-xs text-hpa-slate-5">Claude · {selected.model}</p>
                    </div>
                  </div>

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-hpa-slate-1">
                    {messages.map((msg, i) => <ChatMessage key={i} msg={msg} />)}
                    {sending && (
                      <div className="flex gap-3">
                        <div className="w-7 h-7 rounded-full bg-hpa-gold flex items-center justify-center text-white text-xs">🤖</div>
                        <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-white border border-hpa-slate-2">
                          <Loader2 size={14} className="animate-spin text-hpa-slate-4" />
                        </div>
                      </div>
                    )}
                    <div ref={bottomRef} />
                  </div>

                  {/* Input */}
                  <div className="p-4 border-t border-hpa-slate-2 flex gap-3">
                    <input className="input flex-1"
                      placeholder={`Consultar a ${selected.name}...`}
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                    />
                    <button className="btn btn-primary" onClick={sendMessage} disabled={sending || !input.trim()}>
                      <Send size={15} />
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {tab === 'decisions' && (
          <div className="p-5 space-y-3">
            {decisions.length === 0 ? (
              <Empty icon={CheckCircle} title="Sin aprobaciones pendientes"
                desc="Las sugerencias de los agentes aparecerán aquí para tu revisión" />
            ) : decisions.map(d => (
              <div key={d.id} className="border border-hpa-slate-2 rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-sm text-hpa-slate-9">{d.action_description}</p>
                    <p className="text-xs text-hpa-slate-5 mt-0.5">
                      {d.ai_agents?.name} · {d.context_type} · {fmtDateTime(d.created_at)}
                    </p>
                  </div>
                  <span className={`badge ${d.risk_level === 'low' ? 'badge-green' : d.risk_level === 'medium' ? 'badge-amber' : 'badge-red'}`}>
                    Riesgo {d.risk_level}
                  </span>
                </div>
                <p className="text-xs text-hpa-slate-6 bg-hpa-slate-1 rounded-lg p-3">{d.reasoning}</p>
                <div className="flex gap-2">
                  <button className="btn btn-primary btn-sm" onClick={() => approveDecision(d.id)}>
                    <CheckCircle size={13} /> Aprobar
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => rejectDecision(d.id)}>
                    <XCircle size={13} /> Rechazar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
