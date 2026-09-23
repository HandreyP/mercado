# ADR 0004 — Produtos canónicos e correspondências explícitas

- Estado: aceite
- Data: 2026-09-23

## Contexto

`market_products` identifica um artigo apenas dentro de um supermercado. A
comparação futura exige uma identidade independente, mas nomes semelhantes não
são prova suficiente de equivalência. Nesta fase existe apenas o Pingo Doce.

## Decisão

Criar `canonical_products` para a identidade independente e `product_matches`
para a relação auditável com cada produto de mercado. A relação conserva
confiança, método, estado e motivo.

Os produtos existentes recebem uma identidade 1:1 durante a migração. Novos
produtos recebem a sua identidade na mesma transação da importação. Essas
relações são confirmadas porque representam a identidade inicial do próprio
artigo; não significam correspondência com outro artigo.

Normalização de nome, marca e embalagem serve para pesquisa e futuras sugestões,
mas não funde identidades automaticamente. Fusões futuras deverão ser sugeridas
e revistas através de `product_matches`.

## Consequências

- a API já pode expor um identificador estável e respetivas correspondências;
- o modelo aceita vários produtos de mercado para a mesma identidade;
- não são criados falsos positivos apenas por semelhança textual;
- haverá inicialmente uma identidade canónica por produto do Pingo Doce;
- um segundo mercado não será adicionado até o processo de revisão estar pronto.
