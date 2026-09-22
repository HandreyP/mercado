# ADR 0002 — Organização por fronteiras e desenvolvimento orientado por testes

- Estado: aceite
- Data: 2026-09-21

## Contexto

O primeiro incremento funcional misturava acesso ao PostgreSQL com CLIs, API e
sincronização. As regras do Pingo Doce estavam divididas por vários ficheiros e o
nome dos módulos não tornava clara a fronteira necessária para adicionar outros
mercados. Isso aumentava o custo de mudança e permitia regressões estruturais.

O projeto também precisa de evoluir com evidência explícita: cada alteração deve
mostrar primeiro o comportamento esperado num teste e manter uma documentação
viva das decisões.

## Decisão

Adotar as seguintes fronteiras:

- `src/repositories/*.repository.js`: único local autorizado a importar `pg` ou
  executar consultas SQL;
- `database.repository.js`: pool, health check, transações e advisory locks;
- repositórios especializados: catálogo, importação e migrações;
- `src/scrapers/mercado_<nome>.scrap.js`: URLs, configuração e parsers próprios
  de um supermercado;
- `src/services/`: orquestração e regras de negócio sem SQL;
- entradas (`server`, CLIs): apenas composição de dependências e apresentação.

Adotar TDD em todos os incrementos com o ciclo Red → Green → Refactor. Um teste
arquitetural inspeciona os ficheiros do projeto e rejeita violações das duas
fronteiras principais: BD fora de repositórios e regras do Pingo Doce fora do seu
scraper.

## Consequências

- lógica de negócio pode ser testada com dependências falsas, sem rede ou BD;
- novos mercados têm um ponto de extensão previsível;
- trocar detalhes de persistência não afeta API ou sincronização diretamente;
- cada mudança exige mais trabalho inicial de teste, compensado por menor risco
  de regressão e refatoração mais segura;
- testes de integração continuam necessários: os unitários não validam o motor
  SQL real, permissões de rede nem alterações das páginas públicas;
- documentação e testes fazem parte da definição de pronto, não são tarefas
  posteriores.

## Alternativas consideradas

Manter módulos organizados apenas por funcionalidade foi rejeitado porque não
impedia SQL e detalhes externos de atravessarem camadas. Usar apenas convenções de
revisão também foi rejeitado: uma regra executável dá feedback imediato e pode
ser aplicada localmente e em CI.
