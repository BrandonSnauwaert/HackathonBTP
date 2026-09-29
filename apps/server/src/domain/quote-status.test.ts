import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { allowedTransitions, canTransition, isEditable, timeBasedStatus, type QuoteStatus } from "./quote-status.js";

describe("canTransition", () => {
  it("suit le parcours nominal", () => {
    assert.ok(canTransition("draft", "ready", "artisan"));
    assert.ok(canTransition("ready", "sent", "artisan"));
    assert.ok(canTransition("sent", "viewed", "client"));
    assert.ok(canTransition("viewed", "accepted", "client"));
  });

  it("vérifie qui a le droit de déclencher la transition", () => {
    assert.ok(!canTransition("sent", "viewed", "artisan"), "seul le client consulte");
    assert.ok(!canTransition("sent", "follow_up", "artisan"), "la relance est automatique");
    assert.ok(!canTransition("draft", "ready", "client"));
    assert.ok(canTransition("viewed", "declined", "artisan"), "l'artisan peut noter un refus oral");
  });

  it("interdit de sauter des étapes ou de revenir en arrière", () => {
    assert.ok(!canTransition("draft", "sent", "artisan"));
    assert.ok(!canTransition("sent", "draft", "artisan"));
    assert.ok(!canTransition("follow_up", "viewed", "client"));
  });

  it("n'a aucune sortie depuis un statut final", () => {
    for (const status of ["accepted", "declined", "expired"] as const) {
      assert.deepEqual(allowedTransitions(status, "artisan"), []);
      assert.deepEqual(allowedTransitions(status, "client"), []);
      assert.deepEqual(allowedTransitions(status, "system"), []);
    }
  });
});

describe("isEditable", () => {
  it("n'autorise la modification qu'avant l'envoi", () => {
    assert.ok(isEditable("draft"));
    assert.ok(isEditable("ready"));
    assert.ok(!isEditable("sent"));
    assert.ok(!isEditable("accepted"));
  });
});

describe("timeBasedStatus", () => {
  const sentAt = new Date("2026-10-01T10:00:00Z");
  const at = (days: number) => new Date(sentAt.getTime() + days * 24 * 60 * 60 * 1000);
  const run = (status: QuoteStatus, days: number, sent: Date | null = sentAt) =>
    timeBasedStatus({ status, sentAt: sent, validityDays: 30, followUpAfterDays: 7, now: at(days) });

  it("ne change rien avant le délai de relance", () => {
    assert.equal(run("sent", 6.9), null);
    assert.equal(run("viewed", 3), null);
  });

  it("passe à relancer après 7 jours sans réponse", () => {
    assert.equal(run("sent", 7), "follow_up");
    assert.equal(run("viewed", 10), "follow_up");
    assert.equal(run("follow_up", 10), null);
  });

  it("expire après la durée de validité, en priorité sur la relance", () => {
    assert.equal(run("sent", 30), "expired");
    assert.equal(run("follow_up", 45), "expired");
  });

  it("ne touche ni aux devis non envoyés ni aux statuts finaux", () => {
    assert.equal(run("draft", 100, null), null);
    assert.equal(run("accepted", 100), null);
    assert.equal(run("declined", 100), null);
  });
});
