# Cloud processing governance gate

This application does not claim to make a cloud AI provider automatically
compliant with GDPR, EHDS, Bosnian law, professional confidentiality rules, or
any healthcare certification regime. Health audio and transcripts are highly
sensitive. Clinical cloud mode is deliberately unavailable until the controls
below are approved by the deploying organisation.

## Technical controls in this repository

- Cloud mode is opt-in and disabled by default.
- The application never logs audio, transcript text, note content, or API keys.
- Every OpenRouter request sends `provider.zdr: true` and
  `provider.data_collection: deny`.
- Clinical mode fails closed unless EU in-region routing and an approved
  processor agreement are explicitly configured.
- Clinical mode uses `https://eu.openrouter.ai/api/v1`; model discovery comes
  from the EU account endpoint, so unavailable EU models cannot be selected.
- A denied EU route is surfaced as `compliance_blocked`; the adapter never
  silently falls back to the global endpoint for clinical mode.
- The application treats all generated notes as clinician-review drafts.

## Required organisation approvals before patient use

1. Confirm the controller's lawful basis for both ordinary and special-category
   health data, and document the patient-facing privacy information and any
   consent workflow required by local law.
2. Complete and approve a DPIA with the organisation's DPO/privacy lead.
3. Execute and review a processor agreement/DPA covering OpenRouter and every
   selected inference provider, including sub-processors, data transfers,
   deletion, incident handling, confidentiality, and audit rights.
4. Confirm EU in-region routing is enabled for the account and select only
   models returned by the EU model-discovery endpoint.
5. Enable ZDR and data-collection denial at both account/guardrail level and
   request level; disable OpenRouter input/output logging and data-use opt-ins.
6. Define user access control, authentication, encryption, retention/deletion,
   backup, incident response, human review, clinical validation, and audit
   procedures in the surrounding product—not just in this adapter.

## Why code alone is insufficient

OpenRouter states that EU in-region routing is an account capability and that
provider retention and training policies differ by endpoint. ZDR restricts
routing to eligible endpoints, but it is not a substitute for a processor
agreement or the controller's own GDPR obligations. The EDPB states that a
DPIA is required before processing likely to create a high risk to rights and
freedoms; health-data AI commonly warrants that assessment.

Sources: [OpenRouter sovereign AI controls](https://openrouter.ai/docs/guides/features/sovereign-ai), [OpenRouter provider logging](https://openrouter.ai/docs/guides/privacy/provider-logging), [OpenRouter ZDR](https://openrouter.ai/docs/guides/features/zdr), [EDPB DPIA guidance](https://www.edpb.europa.eu/topics/accountability-and-compliance-tools/data-protection-impact-assessment_en), and [European Commission GDPR obligations overview](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/obligations_en).
