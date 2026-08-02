<td>
                      {isClient ? (
                        item.status === 'approved' ? (
                          <button
                            className="btn btn-sm btn-ghost border border-amber-300 text-amber-700 hover:bg-amber-50"
                            title="Descargar Pagaré Notarial"
                            onClick={() => generarPagare(item)}
                          >
                            📄 Pagaré
                          </button>
                        ) : (
                          <span className="text-xs text-hpa-slate-4">—</span>
                        )
                      ) : (
                        <div className="flex gap-1 items-center flex-wrap">
                          {(item.status === 'submitted' || item.status === 'in_review') && (
                            <>
                              <button className="btn btn-ghost btn-sm btn-icon" title="Editar" onClick={() => openEdit(item)}><Edit2 size={13} /></button>
                              <button className="btn btn-ghost btn-sm btn-icon text-emerald-600" title="Aprobar" onClick={() => openApprove(item)}><CheckSquare size={13} /></button>
                              <button className="btn btn-ghost btn-sm btn-icon text-red-500" title="Rechazar" onClick={() => rejectApplication(item)}><XSquare size={13} /></button>
                            </>
                          )}
                          {item.status === 'approved' && (
                            <>
                              <button
                                className="btn btn-sm btn-ghost border border-amber-300 text-amber-700 hover:bg-amber-50"
                                title="Generar Pagaré Notarial"
                                onClick={() => generarPagare(item)}
                              >
                                📄 Pagaré
                              </button>
                              <button className="btn btn-sm text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100" onClick={() => openDisbursal(item)}>
                                <DollarSign size={13} /><span className="ml-1 text-xs font-semibold">Desembolsar</span>
                              </button>
                              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openEdit(item)}><Edit2 size={13} /></button>
                            </>
                          )}
                          {tab === 'loans' && (
                            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openEdit(item)}><Edit2 size={13} /></button>
                          )}
                        </div>
                      )}
                    </td>
