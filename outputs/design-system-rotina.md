# Rotina — Design system

Versão 0.1 · Proposta para aprovação · 6 de setembro de 2026

Esta especificação orienta todas as telas. Não é uma biblioteca implementada. O nome Rotina é provisório. A base visual aprovada é clara, verde-lima e grafite, com cards sem bordas, espaçamentos generosos e sombra apenas no card em destaque. Os valores e comportamentos adicionais abaixo são propostas a revisar.

## 1. Processo e governança

Para cada funcionalidade: definir comportamento → apresentar UI/UX com os estados relevantes → ajustar → obter aprovação explícita → implementar → validar. Aprovar este documento não autoriza automaticamente desenvolver o app. Mudanças de experiência durante implementação voltam para prévia.

Novos componentes precisam de propósito, anatomia, variantes, estados, comportamento responsivo e acessibilidade documentados. Reutilizar componente existente antes de criar variante. Exceções visuais precisam voltar ao sistema, não ficar isoladas em uma tela.

Após implementação, manter tokens e componentes em packages/ui; regras de negócio em packages/domain, interpretação em packages/parser e documentação/exemplos junto da biblioteca. Telas usam tokens semânticos, não cores ou medidas avulsas. Um catálogo de componentes deverá ser a referência executável, com exemplos dos estados aprovados. Versionar mudanças e registrar decisões; alterações incompatíveis exigem migração das telas afetadas.

## 2. Princípios

- Captura rápida e próximo passo claros.
- Uma ação principal por região de decisão.
- Cards agrupam informação relacionada; não transformar cada linha em um card.
- Cor reforça significado, sempre acompanhada de texto ou ícone.
- Valores financeiros têm contexto e período explícitos.
- Priorizar clareza e toque confortável sobre densidade.
- Tema claro nesta versão; tema escuro exige sua própria prévia e aprovação.

## 3. Tokens de cor

| Token semântico | Valor | Uso |
|---|---|---|
| background.canvas | #F7F7F7 | Fundo da aplicação |
| background.surface | #FFFFFF | Cards, menus e formulários |
| background.subtle | #F0F6E5 | Seleção suave e grupos auxiliares |
| background.featured | #232323 | Card em destaque |
| text.primary | #202020 | Títulos e texto principal |
| text.secondary | #6C6C6C | Metadados sobre branco ou canvas |
| text.inverse | #FFFFFF | Texto sobre grafite |
| text.inverseSecondary | #C5C5C5 | Metadados sobre grafite |
| action.primary | #B5DB69 | Botão principal, progresso e seleção |
| action.primaryHover | #A7CF58 | Hover do botão principal |
| action.primaryPressed | #99C147 | Pressionado |
| action.onPrimary | #202020 | Texto e ícone sobre lima |
| action.link | #52682C | Links e tags; nunca usar lima para texto sobre branco |
| border.control | #858B7E | Limite de campos e controles quando necessário |
| divider.subtle | #E9ECE5 | Separadores decorativos |
| focus.ring | #52682C | Foco em superfícies claras |
| focus.inverse | #B5DB69 | Foco em superfícies escuras |
| status.success / surface | #395828 / #EEF5E7 | Concluído, pago |
| status.warning / surface | #895019 / #FFF3E3 | Vence em breve, atenção |
| status.danger / surface | #B13F36 / #FCEEEB | Erro, vencido, ação destrutiva |
| status.info / surface | #315F91 / #EEF4FB | Informação, sincronização |
| state.disabled / text | #EAEAEA / #737373 | Indisponível; explicar motivo quando útil |

Cards não têm borda. Essa regra não remove limites de campos, checkboxes ou foco de teclado. Linhas suaves não devem ser a única forma de reconhecer um controle.

## 4. Tipografia e conteúdo

Fonte proposta: Inter, com system-ui e sans-serif como fallback. Pesos 400 (texto) e 500 (ênfase). Não depender da fonte remota para legibilidade.

| Papel | Tamanho / entrelinha | Uso |
|---|---|---|
| Valor principal | 34 / 40 px | Resumo financeiro em destaque |
| Título da página | 28 / 36 px; mobile 24 / 32 | Uma vez por tela |
| Título de seção | 18 / 26 px | Grupos principais |
| Título de card | 16 / 24 px | Identificação do conteúdo |
| Corpo e campos | 16 / 24 px | Leitura e entrada |
| Rótulo compacto | 14 / 20 px | Botões, tags, linhas densas |
| Metadado | 12 / 18 px | Informação secundária não essencial |

Usar rem na implementação. Valores e colunas financeiras usam algarismos tabulares. Não reduzir texto para acomodar conteúdo: quebrar linhas ou reorganizar. Títulos em caixa normal; evitar caixa alta extensa. Datas: “18 set”, “Hoje, 17h”; datas completas na edição. Moeda: “R$ 1.250,90”. Parcelas: “3 de 10” ou “3/10” junto de rótulo acessível. Não usar “saldo” sem identificar a que saldo se refere.

Botões com verbo: “Salvar tarefa”, “Registrar pagamento”, “Ver fatura”. Erros dizem como corrigir: “Informe um valor maior que zero”. Excluir usa objeto explícito. Estados vazios oferecem uma ação útil sem culpa ou mensagens motivacionais automáticas.

## 5. Espaço, forma e elevação

Escala: 4, 8, 12, 16, 20, 24, 28, 32, 40, 48 px. Margem da página: 16 px mobile, 24 px tablet, 28 px desktop. Entre cards: 16 px vertical, 20 px entre colunas. Interior de card: 18 px; card em destaque: 22 px. Entre rótulo e campo: 8 px; entre campos: 16 px; entre seções: 24–32 px.

Raios: card 18 px; captura 22 px; subgrupo 14 px; campo 12 px; modal 24 px; botão e chip 999 px. Não aumentar arredondamento com o tamanho do viewport.

Cards comuns: sombra nenhuma e borda nenhuma. Card em destaque: `0 10px 24px -8px rgba(0,0,0,.28), 0 3px 8px -3px rgba(0,0,0,.12)`. Usar no máximo um destaque por seção principal. Menu: `0 6px 20px rgba(0,0,0,.12)`. Modal: `0 16px 48px rgba(0,0,0,.20)` e fundo de sobreposição preto a 35%.

Camadas propostas: conteúdo 0; navegação aderente 10; menu 20; fundo de modal 30; modal 40; toast 50. Menus em modal devem permanecer dentro de sua camada.

## 6. Layout responsivo

Mobile primeiro: 320–767 px, uma coluna e navegação inferior Hoje/Tarefas/Agenda/Finanças. Projetos acessíveis em Tarefas. Respeitar área segura e reservar espaço para navegação; teclado não pode esconder entrada nem ação de salvar.

Tablet: 768–1023 px, até duas colunas quando cada coluna mantiver pelo menos 280 px; caso contrário, empilhar. Desktop: a partir de 1024 px, barra lateral de 190 px e conteúdo com largura máxima proposta de 1280 px. Grade Hoje em duas colunas, proporção aproximada 1,15:1. Não esticar texto indefinidamente.

Ordem mobile de Hoje: captura → atenção quando houver → agenda → tarefas → resumo financeiro → próximos pagamentos → projetos → últimos gastos. Ordem semântica consistente com leitura e teclado. Conteúdo essencial nunca some no mobile. Tabelas viram listas com os mesmos campos prioritários; rolagem horizontal somente em comparações que realmente exigirem colunas.

## 7. Inventário de componentes

| Componente | Anatomia e variantes | Comportamento |
|---|---|---|
| Button / IconButton | Primário lima; secundário neutro; ghost; destrutivo; ícone opcional | Altura 44 px, padding horizontal 16 px; ícone isolado 44×44 com nome acessível |
| Card | Cabeçalho, conteúdo, rodapé opcional; padrão ou destaque | Sem bordas; só cards acionáveis têm hover; ações internas independentes |
| TextField / TextArea | Rótulo persistente, campo, ajuda, erro; prefixo/sufixo opcional | Campo mínimo 44 px; textarea expande; placeholder nunca substitui rótulo |
| MoneyField | Moeda, valor, ajuda | Formato pt-BR, teclado decimal, não formatar de forma que impeça edição |
| Select / Combobox | Rótulo, seleção, lista e busca quando útil | Enter seleciona; Escape fecha; setas navegam; seleção tem texto explícito |
| Date / Time picker | Entrada digitável e calendário/horário auxiliar | Aceitar teclado e mostrar data completa; validar dias impossíveis |
| Checkbox / Switch / Radio | Controle e rótulo clicável | Checkbox conclui/seleciona; switch muda configuração imediata; radio escolhe uma opção |
| Tag / ProjectChip | #tag ou @projeto; remoção opcional | Várias tags e um projeto inicialmente; separar chip informativo de botão |
| StatusBadge | Texto e ícone opcional, fundo semântico suave | Pago, Pendente, Vencido, Em andamento; nunca apenas ponto colorido |
| Tabs / SegmentedControl | Seleção, rótulos e painel | Tabs trocam seção local; segmented escolhe uma visão curta, sem duplicar navegação |
| Navigation | Ícone, nome, seleção; contagem opcional | aria-current na página ativa; mesmo destino no mobile e desktop |
| TaskRow | Checkbox, título, prazo, tags/projeto e menu | Linha expande detalhes; concluir tem desfazer; menu não conclui tarefa |
| EventRow | Horário, título, duração, local e projeto/tag | Sem checkbox de tarefa; horário e título prioritários |
| FinancialRow | Descrição, data/status, valor e origem | Valor alinhado; origem e período claros; compra e pagamento distinguíveis |
| InvoiceCard | Cartão, período, vencimento, total, pago e restante | Resumo expansível; pagamento parcial visível; ação Registrar pagamento |
| InstallmentList | Compra principal, parcela atual, restantes e totais | Vincular compra original; indicar fatura de cada parcela |
| DebtCard | Credor, saldo, próximo vencimento e pagamentos | Diferenciar saldo da dívida e parcela do mês |
| ProjectCard | Nome, status, progresso, próxima ação | Progresso calculado de tarefas; não inventar percentuais de gasto como progresso |
| Progress | Rótulo, valor, trilha e preenchimento | Texto “6 de 10”; trilha neutra; sem depender só de cor |
| Search / Filter | Consulta, filtros ativos, limpar e resultados | Busca global separada da captura; filtros persistem apenas conforme regra da tela |
| Table / List | Cabeçalho, linhas, ordenação e paginação quando necessária | Valores alinhados; cabeçalhos acessíveis; mobile preserva dados importantes |
| Menu / Popover | Ações ou contexto breve | Ancorado no disparador; fecha com Escape e devolve foco |
| Dialog / Sheet | Título, conteúdo, ações e fechar | Dialog desktop até 480 px; sheet mobile, página para formulário longo |
| Toast / InlineAlert | Resultado ou mensagem com ação opcional | Toast para sucesso; erro próximo do campo; crítico não desaparece automaticamente |
| Empty / Skeleton / Error | Mensagem ou estrutura e próximo passo | Estado vazio não é carregamento; skeleton preserva espaço; erro oferece tentar novamente |

Ícones: família Lucide, traço consistente; 20 px em controles, 24 px na navegação, 16 px em metadados. Não misturar famílias. Ícones decorativos ocultos para leitor de tela; ações sempre nomeadas. Ilustrações são opcionais em estados vazios e nunca necessárias para operar.

## 8. Estados e contratos de interação

Todos os componentes interativos especificam: padrão, hover (mouse), foco visível, pressionado, selecionado quando aplicável, desabilitado e carregando. Hover não muda geometria. Foco: anel de 2 px com afastamento de 2 px; sobre grafite usar lima. Não remover foco por causa da regra de cards sem borda.

Botão carregando mantém largura, apresenta “Salvando…” e bloqueia envio duplicado; feedback de leitor de tela. Campos inválidos mantêm conteúdo, associam mensagem com aria-describedby e aria-invalid. Submissão leva ao primeiro erro. Erro global aparece junto da ação, sem apagar o formulário.

Sucesso simples: toast com texto curto por cerca de 5 segundos, pausa em hover/foco; ações relevantes de desfazer também ficam disponíveis no histórico ou item, sem depender de tempo curto. Exclusão definitiva pede confirmação com nome do objeto; exclusão reversível pode oferecer desfazer.

Modal prende foco, impede interação com fundo, aceita Escape quando não houver operação impeditiva e devolve foco ao disparador. Não fechar e perder formulário alterado sem aviso. Bottom sheet deve ter botão de fechar e não depender de gesto. Tooltip apenas complementa, nunca contém instrução essencial.

## 9. Captura por linguagem natural

Fluxo: digitar → prévia → corrigir → salvar → resultado com desfazer. Exemplos: “Dentista dia 18 17h”, “Almoço 35,90 VR”, “Notebook 3600 em 10x Nubank @Escritório #equipamentos”.

Prévia: tipo de registro, título, campos identificados e ação de salvar. Tokens editáveis abrem seletores acessíveis. Tags # e projetos @ têm autocomplete, nomes com espaços e suporte por teclado. Campos não identificados não são silenciosamente inventados. Data passada e primeira fatura ficam explícitas. Tipo ambíguo oferece escolha; dados indispensáveis ausentes impedem salvar com mensagem específica.

No mobile, editor abre com espaço suficiente acima do teclado; revisão pode ocupar sheet. No desktop, painel junto da captura. Preservar texto ao fechar acidentalmente ou falhar. Mostrar estado pendente enquanto interpreta; falha de interpretação permite preenchimento manual. A prévia visual não representa um parser já implementado.

## 10. Padrões dos módulos

Hoje: atenção, agenda, tarefas, finanças, projetos. Tarefas: Hoje/Próximas/Sem prazo e filtros; concluída com texto riscado e ação reversível. Projetos: tarefas, agenda e gastos vinculados usando o mesmo projeto. Agenda: lista como base mobile, calendário semanal/mensal como visões futuras a aprovar.

Finanças: Gastos, Contas, Cartões/Faturas, Dívidas e Contas/Carteiras. “Compras do mês”, “Compromissos do mês” e “Pagamentos realizados” são perspectivas distintas. Fatura liquidada não cria segunda despesa. Valor restante após pagamento parcial é explícito; estorno aparece identificado e vinculado. Compra parcelada mostra valor total e valor por parcela; primeira fatura editável. Parcelamento de fatura é distinto de parcelamento de compra.

Privacidade: ocultar valores em todos os resumos visíveis, inclusive nomes acessíveis que revelariam montantes. Não anunciar valores ocultos para leitor de tela. Tela de edição continua com acesso explícito aos valores necessários. Não exibir zeros onde dados não carregaram: usar “—” e estado correspondente.

## 11. Acessibilidade e movimento

Meta de implementação: contraste de texto normal de pelo menos 4,5:1, texto grande e controles essenciais 3:1; validar pares finais e estados antes de declarar conformidade. Testar zoom de 200%, largura 320 px, teclado e leitor de tela. Alvos de toque 44×44 px; checkbox visual pode ser 20 px dentro de alvo maior.

Links identificáveis além da cor. Erros/status combinam texto com indicação visual. Cabeçalhos hierárquicos, landmark de navegação e main. Não usar placeholder de baixo contraste como informação obrigatória. Nenhuma tarefa essencial depende de hover, arrastar ou animação.

Transições propostas: 120 ms para feedback, 180 ms para expansão, 220 ms para overlays; ease-out. Sem animações contínuas. Respeitar prefers-reduced-motion, removendo movimento e shimmer; carregamento permanece identificável por texto.

## 12. Validação e próximos passos

O catálogo visual desta entrega é uma amostra dos componentes principais, não todas as telas nem uma biblioteca pronta. Antes de implementar cada fluxo, produzir sua prévia completa com casos normal, vazio, carregando, erro e sucesso; acrescentar pagamento parcial, estorno e ambiguidade onde aplicável.

Critérios de revisão: fidelidade aos tokens; cards sem borda; destaque com sombra; hierarquia clara; ações nomeadas; reflow sem perda; números sem duplicação; campos revisáveis; foco e mensagens acessíveis. Na implementação, incluir testes de interação relevantes para captura, validação, modal e pagamentos, além de revisão visual mobile/desktop.

Base aprovada: identidade, cards, espaçamentos e sombra. Aguardam aprovação nesta versão: escala tipográfica formal, tokens semânticos, contratos de componentes e estados adicionais. Próxima etapa recomendada: revisar a captura rápida, pois será compartilhada por todos os módulos.


## Revisão de cores — 18 de setembro de 2026

Fundos, cards, campos, superfícies elevadas, textos e sombras passam a cinzas neutros, sem tonalidade verde. Verde reservado a tags, botões e bordas/foco de controles. Cards continuam sem borda; destaque preserva sombra. Cores semânticas de aviso, erro e informação continuam nos indicadores correspondentes. Esta revisão prevalece sobre descrições anteriores de fundos verdes. Progresso usa cinza neutro.
