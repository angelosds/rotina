# Rotina — modo escuro

Proposta 0.2 · 7 de setembro de 2026 · Aguardando aprovação visual.

Complementa design-system-rotina.md. Preserva componentes, anatomia, espaçamentos, tipografia, raios, navegação, estados e fluxos. Não inicia implementação nem substitui a versão clara aprovada.

## Tokens que mudam

| Papel | Escuro |
|---|---|
| Canvas | #141414 |
| Card / menu | #222222 |
| Campo / captura interna | #191919 |
| Card em destaque | #353535 |
| Texto principal | #EEEEEE |
| Texto secundário | #B0B0B0 |
| Texto secundário no destaque | #D3D3D3 |
| Primário / hover / pressionado | #B5DB69 / #A7CF58 / #99C147 |
| Texto no primário | #202020 |
| Seleção / sucesso fundo | #303E23 |
| Seleção / sucesso texto | #C4DF99 |
| Secundário fundo / texto | #343434 / #EEEEEE |
| Desabilitado fundo / texto | #2B2B2B / #A3A3A3 |
| Campo borda | #849078 |
| Foco | #B5DB69 |
| Aviso fundo / texto | #3D3020 / #F4C58B |
| Erro fundo / texto | #432724 / #FFB4A9 |
| Informação fundo / texto | #233448 / #B3D2F5 |
| Trilha / separador | #3B3B3B |

Cards permanecem sem borda. O card principal usa grafite com tonalidade verde mais clara que os demais, para continuar identificável. Sombra: `0 12px 28px -8px rgba(0,0,0,.6), 0 4px 10px -3px rgba(0,0,0,.35)`. Não usar brilho verde como sombra. Superfícies e texto fazem a separação principal; sombra é complementar.

O botão lima mantém texto escuro em todos os estados. Não aplicar texto claro globalmente ao botão principal. Campos têm foco e bordas identificáveis; erros são acompanhados por mensagem. Chips usam cores semânticas próprias, sem inversão automática da paleta clara.

## Comportamento proposto

Na futura implementação, preferência Claro / Escuro / Sistema em aparência; Sistema como padrão inicial. Aplicar preferência antes da primeira pintura para evitar flash. Persistir a escolha; mudança de tema não altera dados nem filtros. Não depender apenas da configuração do dispositivo. Essa configuração ainda precisa da sua prévia de UI/UX.

O catálogo entregue demonstra botões, campos, validação, tags, estados, tarefas, progresso, captura, fatura, vazio e card em destaque. Valores são fictícios; interações são locais. Validar contraste de todos os pares e estados, foco, zoom e leitores de tela na implementação antes de declarar conformidade. Manter os mesmos critérios de aprovação do sistema claro.


## Revisão de cores — 18 de setembro de 2026

Fundos, cards, campos, superfícies elevadas, textos e sombras passam a cinzas neutros, sem tonalidade verde. Verde reservado a tags, botões e bordas/foco de controles. Cards continuam sem borda; destaque preserva sombra. Cores semânticas de aviso, erro e informação continuam nos indicadores correspondentes. Esta revisão prevalece sobre descrições anteriores de fundos verdes. Progresso usa cinza neutro.
