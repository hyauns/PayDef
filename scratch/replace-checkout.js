const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../app/api/gateway/checkout/route.ts');
let content = fs.readFileSync(filePath, 'utf8');

const startMarker = `    // ── Step 8. Mask item name + build shield URLs ───────────────────────────`;
const endMarker = `    // ── Step 9. Create PayPal order ──────────────────────────────────────────`;

const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
  console.log("Could not find markers.", { startIndex, endIndex });
  process.exit(1);
}

const replacement = `    // ── Step 8. Resolve Identity, Mask item name + build shield URLs ─────────
    
    // PAYMENT_DISPLAY_PROFILE_MODE integration (Phase 2A + Phase 3)
    const profileMode = (process.env.PAYMENT_DISPLAY_PROFILE_MODE || "shadow") as "shadow" | "enforce"
    const bundleMode = (process.env.PAYMENT_IDENTITY_BUNDLE_MODE || "shadow") as "shadow" | "enforce" | "disabled"
    
    // Phase 4: Resolve legacy Payment Display Profile (Priority B)
    const profile = await resolvePaymentDisplayProfile({
      tenantId,
      storeId: store.id,
      merchantAccountId: account.id,
      storeName: "Unknown Store", // Will be fetched inside if needed
    })
    
    const legacyMasker = (realName: string) => account.item_masking 
      ? maskItemName(realName, account.fake_product_name)
      : maskItemName(realName)

    // Default legacy line item result
    let lineItemResult = buildPayPalLineItemsForProfile({
      profile,
      originalItems: [{
        name:     itemName,
        quantity: "1",
        unitAmount: { currencyCode: currency, value: amountStr },
      }],
      checkoutTotal: amountStr,
      currency,
      transactionId,
      mode: profileMode,
      legacyMasker,
    })

    txLog.info("payment_display_profile.resolved",
      \`Payment Display Profile resolved source=\${profile.source} mode=\${profileMode}\`,
      {
        storeId: store.id,
        tenantId,
        merchantAccountId: account.id,
        profileId: profile.profileId,
        source: profile.source,
        industryVertical: profile.industryVertical,
        displayMode: profile.displayMode,
        lineItemPolicy: profile.lineItemPolicy,
        mode: profileMode,
      }
    )

    txLog.info("payment_display_profile.line_items_built",
      \`Line items built: policy=\${lineItemResult.lineItemPolicy} mode=\${profileMode} invariant=\${lineItemResult.amountInvariantPassed}\`,
      {
        mode: profileMode,
        profileId: profile.profileId,
        source: profile.source,
        industryVertical: profile.industryVertical,
        displayMode: profile.displayMode,
        lineItemPolicy: lineItemResult.lineItemPolicy,
        legacyItemCount: lineItemResult.legacyItems.length,
        profileItemCount: lineItemResult.profileItems.length,
        selectedItemCount: lineItemResult.selectedItems.length,
        amountInvariantPassed: lineItemResult.amountInvariantPassed,
        skipRandomization: lineItemResult.skipRandomization,
      }
    )

    if (!lineItemResult.amountInvariantPassed) {
      txLog.warn("payment_display_profile.line_item_invariant_failed",
        \`Amount invariant failed for policy=\${lineItemResult.lineItemPolicy} — fell back to SINGLE_SEMANTIC_ITEM\`,
        { storeId: store.id, tenantId, merchantAccountId: account.id, lineItemPolicy: lineItemResult.lineItemPolicy, profileId: profile.profileId }
      )
    }

    // ── PI-3B: Payment Identity Bundle (Priority A) ──────────────────────────
    let finalShieldDomain = account.shield_domain
    let shieldDomainId: string | undefined
    let identityDomainUsed = false
    let fallbackReason = "no_bundle"
    let bundleIdLog: string | undefined = undefined
    let candidateDescriptorLog: string | undefined = undefined
    let assignmentMatchLog = { merchantAccount: false, shieldDomain: false }

    try {
      if (account.bundle_id) {
        txLog.info("payment_identity_bundle.resolve_start",
          \`Identity bundle resolve: mode=\${bundleMode} account=\${account.id}\`, {
            tenantId,
            storeId: store.id,
            merchantAccountId: account.id,
            checkoutAmount: amount,
            mode: bundleMode,
          })

        const bundleResult = await resolvePaymentIdentityBundleForCheckout({
          tenantId,
          storeId: store.id,
          merchantAccountId: account.id,
          shieldDomainId: null, // we are resolving it from the bundle now!
          checkoutAmount: amount,
          mode: bundleMode,
        })

        bundleIdLog = bundleResult.bundleId || undefined
        candidateDescriptorLog = bundleResult.candidateDescriptor ?? undefined
        assignmentMatchLog = bundleResult.assignmentMatch

        txLog.info("payment_identity_bundle.resolve_result",
          \`Identity bundle result: bundle=\${bundleResult.bundleId ?? "none"} item=\${bundleResult.selectedItemId ?? "none"} reason=\${bundleResult.reason}\`, {
            tenantId, storeId: store.id, merchantAccountId: account.id,
            bundleId: bundleResult.bundleId, selectedItemId: bundleResult.selectedItemId,
            reason: bundleResult.reason, mode: bundleResult.mode,
            assignmentMatch: bundleResult.assignmentMatch, warnings: bundleResult.warnings,
            checkoutAmount: amount,
          })

        if (bundleResult.selectedItem) {
          txLog.info("payment_identity_bundle.item_selected",
            \`Bundle item: descriptor="\${bundleResult.candidateDescriptor}" type=\${bundleResult.selectedItem.product_type}\`, {
              tenantId, storeId: store.id, merchantAccountId: account.id,
              bundleId: bundleResult.bundleId, selectedItemId: bundleResult.selectedItemId,
              candidateDescriptor: bundleResult.candidateDescriptor, productType: bundleResult.selectedItem.product_type,
              descriptorName: bundleResult.selectedItem.descriptor_name,
            })
        }

        if (bundleResult.warnings.length > 0) {
          txLog.warn("payment_identity_bundle.resolve_warning",
            \`Bundle warnings: \${bundleResult.warnings.join("; ")}\`, {
              tenantId, storeId: store.id, merchantAccountId: account.id,
              bundleId: bundleResult.bundleId, warnings: bundleResult.warnings,
            })
        }

        // Apply Priority A Source of Truth
        if (bundleResult.bundle && bundleResult.primaryShieldDomain) {
          // Resolve shieldDomainId internally
          const sdRows = await client.query<{ id: string }>(
            \`SELECT id FROM shield_domains
             WHERE LOWER(domain) = LOWER($1) 
               AND is_active = true 
               AND health_ok = true
               AND (tenant_id = $2 OR tenant_id IS NULL)\`,
            [bundleResult.primaryShieldDomain, tenantId]
          )
          
          if (sdRows.rows.length > 0) {
            shieldDomainId = sdRows.rows[0].id
            finalShieldDomain = bundleResult.primaryShieldDomain
            identityDomainUsed = true
            fallbackReason = "none"

            txLog.info("payment_identity.runtime_source_selected", "Priority A: Payment Identity Selected", {
              tenantId, storeId: store.id, merchantAccountId: account.id, transactionId,
              source: "payment_identity", bundleId: bundleResult.bundleId, reason: "valid_bundle_domain"
            })

            txLog.info("payment_identity.domain_from_identity", "Domain from Payment Identity", {
              bundleId: bundleResult.bundleId, primaryShieldDomain: finalShieldDomain,
              shieldDomainId, identityDomainUsed: true
            })
          } else {
             fallbackReason = "primary_shield_domain_unhealthy"
             txLog.info("payment_identity.runtime_source_selected", "Priority B: Legacy Selected", {
               tenantId, storeId: store.id, merchantAccountId: account.id, transactionId,
               source: "legacy", bundleId: bundleResult.bundleId, reason: fallbackReason
             })
             txLog.info("payment_identity.domain_fallback_legacy", "Fallback to legacy domain", {
               bundleId: bundleResult.bundleId, fallbackReason, legacyShieldDomain: finalShieldDomain
             })
          }
        } else {
           fallbackReason = "missing_primary_shield_domain"
           txLog.info("payment_identity.runtime_source_selected", "Priority B: Legacy Selected", {
             tenantId, storeId: store.id, merchantAccountId: account.id, transactionId,
             source: "legacy", bundleId: bundleResult.bundleId, reason: fallbackReason
           })
           if (bundleResult.bundle) {
             txLog.info("payment_identity.domain_fallback_legacy", "Fallback to legacy domain", {
               bundleId: bundleResult.bundleId, fallbackReason, legacyShieldDomain: finalShieldDomain
             })
           }
        }

        // Priority A Enforce Descriptor
        if (bundleResult.mode === "enforce") {
          txLog.info("payment_identity_bundle.enforce_start", "Starting Identity Bundle enforce evaluation", {
            tenantId, storeId: store.id, merchantAccountId: account.id, bundleId: bundleResult.bundleId,
          })

          const candidate = bundleResult.candidateDescriptor

          if (bundleResult.reason === "disabled_by_mode") {
             txLog.warn("payment_identity_bundle.enforce_fallback", "Resolver disabled by mode", {
               tenantId, storeId: store.id, fallbackReason: "mode_not_enforce"
             })
          } else if (!bundleResult.bundle) {
             txLog.warn("payment_identity_bundle.enforce_fallback", "No bundle assigned to merchant/store", {
               tenantId, storeId: store.id, fallbackReason: "no_bundle"
             })
          } else if (!bundleResult.selectedItem) {
             txLog.warn("payment_identity_bundle.enforce_fallback", "Bundle has no active selected item", {
               tenantId, storeId: store.id, bundleId: bundleResult.bundleId, fallbackReason: "no_selected_item"
             })
          } else if (!candidate) {
             txLog.warn("payment_identity_bundle.enforce_fallback", "Missing candidate descriptor", {
               tenantId, storeId: store.id, bundleId: bundleResult.bundleId, fallbackReason: "missing_candidate_descriptor"
             })
          } else if (candidate.length > 127) {
             txLog.warn("payment_identity_bundle.enforce_fallback", \`Candidate descriptor too long (\${candidate.length} > 127)\`, {
               tenantId, storeId: store.id, bundleId: bundleResult.bundleId, candidateLength: candidate.length, fallbackReason: "descriptor_too_long"
             })
          } else {
             lineItemResult = {
               ...lineItemResult,
               selectedItems: [{
                 name: candidate,
                 quantity: "1",
                 unitAmount: { currencyCode: currency, value: amountStr }
               }],
               lineItemPolicy: "SINGLE_SEMANTIC_ITEM",
               skipRandomization: true
             }

             const checkoutTotalCents = Math.round(parseFloat(amountStr) * 100)
             txLog.info("payment_identity_bundle.enforce_preflight", "Identity bundle enforce preflight checks", {
               tenantId, storeId: store.id, bundleId: bundleResult.bundleId,
               amountInvariantPassed: true, selectedItemCount: 1,
               selectedTotalCents: checkoutTotalCents, checkoutTotalCents: checkoutTotalCents
             })

             txLog.info("payment_identity_bundle.enforce_applied", "Identity bundle enforced on PayPal payload", {
               tenantId, storeId: store.id, merchantAccountId: account.id, shieldDomainId,
               bundleId: bundleResult.bundleId, selectedItemId: bundleResult.selectedItemId,
               mode: bundleResult.mode, candidateDescriptor: candidate, candidateLength: candidate.length,
               amountInvariantPassed: true, selectedItemCount: 1,
             })
          }
        }
      } else {
        txLog.info("payment_identity.runtime_source_selected", "Priority B: Legacy Selected", {
          tenantId, storeId: store.id, merchantAccountId: account.id, transactionId,
          source: "legacy", reason: "no_account_bundle_id"
        })
      }
    } catch (bundleResolverErr) {
      txLog.error("payment_identity_bundle.resolve_error", "Bundle resolver failed", {
        tenantId, storeId: store.id, merchantAccountId: account.id, error: bundleResolverErr
      })
    }

    // ── Phase 4: Legacy Shield Domain Consistency (Priority B) ───────────────
    if (!identityDomainUsed) {
      let shieldProfileMatched = false
      if (preferredProfileId) {
        const sdRows = await client.query<{ id: string, domain: string }>(
          \`SELECT id, domain 
           FROM shield_domains 
           WHERE tenant_id = $1 
             AND display_profile_id = $2 
             AND is_active = true 
             AND health_ok = true 
           ORDER BY created_at DESC 
           LIMIT 1\`,
          [tenantId, preferredProfileId]
        )
        if (sdRows.rows.length > 0) {
          finalShieldDomain = sdRows.rows[0].domain
          shieldDomainId = sdRows.rows[0].id
          shieldProfileMatched = true
        }
      }

      if (!shieldDomainId && finalShieldDomain) {
        const fallbackIdRows = await client.query<{ id: string }>(
          \`SELECT id FROM shield_domains
           WHERE LOWER(domain) = LOWER($1) 
             AND is_active = true 
             AND health_ok = true
             AND (tenant_id = $2 OR tenant_id IS NULL)\`,
          [finalShieldDomain, tenantId]
        )
        if (fallbackIdRows.rows.length === 1) {
          shieldDomainId = fallbackIdRows.rows[0].id
        } else if (fallbackIdRows.rows.length > 1) {
          txLog.warn("payment_display_profile.shield_domain_ambiguous", "Multiple shield domains match fallback hostname", {
            targetHost: finalShieldDomain, tenantId, matchCount: fallbackIdRows.rows.length
          })
        }
      }

      txLog.info("payment_display_profile.shield_domain_selected", "Legacy Shield domain selected for transaction", {
        tenantId, storeId: store.id, resolvedProfileId: preferredProfileId, shieldDomainId,
        profileMatched: shieldProfileMatched, fallbackUsed: !shieldProfileMatched,
        fallbackIdResolved: !shieldProfileMatched && !!shieldDomainId, targetHost: finalShieldDomain,
      })
    }

    // Domain mismatch warning
    if (account.shield_domain && finalShieldDomain && account.shield_domain !== finalShieldDomain) {
      txLog.warn("payment_identity.domain_mismatch_warning", "Legacy account shield domain differs from selected target host", {
        bundleId: bundleIdLog, identityDomain: finalShieldDomain, legacyAccountShieldDomain: account.shield_domain, merchantAccountId: account.id
      })
    }

    // Final Consistency Check Log
    txLog.info("payment_identity.runtime_consistency_check", "Payment Identity consistency check", {
      targetHost: finalShieldDomain,
      shieldDomainId,
      bundleId: bundleIdLog,
      candidateDescriptor: candidateDescriptorLog,
      assignmentMatch: assignmentMatchLog,
      amountInvariantPassed: lineItemResult.amountInvariantPassed
    })

    const executeToken = generateExecuteToken(transactionId)
    const { returnUrl, cancelUrl } = buildShieldUrls(
      finalShieldDomain,
      transactionId,
      executeToken
    )
    
    txLog.info("checkout.execute_token_generated",
      \`Execute token: tx=\${transactionId} enabled=\${executeToken !== null} \` +
      \`mode=\${getExecuteTokenMode()} generated=\${executeToken !== null} \` +
      \`returnUrlHasEt=\${returnUrl.includes("et=")}\`,
      {
        storeId: store.id, tenantId, merchantAccountId: account.id,
        tokenEnabled: executeToken !== null, tokenGenerated: executeToken !== null, returnUrlHasEt: returnUrl.includes("et=")
      }
    )

`;

const newContent = content.substring(0, startIndex) + replacement + content.substring(endIndex);

fs.writeFileSync(filePath, newContent);
console.log("Successfully wrote updated route.ts");
