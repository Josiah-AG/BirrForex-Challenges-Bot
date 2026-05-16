"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RULE_LIBRARY } from "@/types";
import type { RuleCode } from "@/types";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Trophy,
  DollarSign,
  FileText,
  Shield,
  Check,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";

interface SelectedRule {
  ruleCode: RuleCode;
  parameters: Record<string, number | boolean | string[]>;
}

export default function CreateChallengePage() {
  const [step, setStep] = useState(1);
  const totalSteps = 4;

  // Step 1: Basic Info
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"demo" | "real" | "hybrid">("hybrid");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Step 2: Balance & Prizes
  const [startingBalance, setStartingBalance] = useState("");
  const [targetBalance, setTargetBalance] = useState("");
  const [realPrizes, setRealPrizes] = useState(["500", "300", "200"]);
  const [demoPrizes, setDemoPrizes] = useState(["300", "200", "100"]);

  // Step 3: Rules
  const [selectedRules, setSelectedRules] = useState<SelectedRule[]>([
    { ruleCode: "MAX_LOT_SIZE", parameters: { maxLots: 0.02 } },
    { ruleCode: "MAX_OPEN_TRADES", parameters: { maxOpen: 3 } },
    { ruleCode: "REQUIRE_STOP_LOSS", parameters: { maxLossPerTrade: 5 } },
    { ruleCode: "NO_WEEKEND_TRADING", parameters: {} },
    { ruleCode: "NO_RECHARGE", parameters: {} },
  ]);

  // Step 4: Review (no state needed)

  const addRule = (code: RuleCode) => {
    if (selectedRules.find((r) => r.ruleCode === code)) return;
    const def = RULE_LIBRARY.find((r) => r.code === code);
    if (!def) return;
    const params: Record<string, number | boolean | string[]> = {};
    def.parameterSchema.forEach((p) => {
      params[p.key] = p.type === "number" ? 0 : p.type === "boolean" ? false : [];
    });
    setSelectedRules([...selectedRules, { ruleCode: code, parameters: params }]);
  };

  const removeRule = (code: RuleCode) => {
    setSelectedRules(selectedRules.filter((r) => r.ruleCode !== code));
  };

  const updateRuleParam = (code: RuleCode, key: string, value: number | boolean | string[]) => {
    setSelectedRules(
      selectedRules.map((r) =>
        r.ruleCode === code ? { ...r, parameters: { ...r.parameters, [key]: value } } : r
      )
    );
  };

  const addPrize = (category: "real" | "demo") => {
    if (category === "real") setRealPrizes([...realPrizes, ""]);
    else setDemoPrizes([...demoPrizes, ""]);
  };

  const removePrize = (category: "real" | "demo", index: number) => {
    if (category === "real") setRealPrizes(realPrizes.filter((_, i) => i !== index));
    else setDemoPrizes(demoPrizes.filter((_, i) => i !== index));
  };

  const updatePrize = (category: "real" | "demo", index: number, value: string) => {
    if (category === "real") {
      const updated = [...realPrizes];
      updated[index] = value;
      setRealPrizes(updated);
    } else {
      const updated = [...demoPrizes];
      updated[index] = value;
      setDemoPrizes(updated);
    }
  };

  const handleCreate = () => {
    // TODO: API call to create challenge
    alert("Challenge created successfully! (Mock)");
    window.location.href = "/host-dashboard";
  };

  return (
    <div className="min-h-screen bg-[#0a0e1a]">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-royal/10 rounded-full blur-3xl animate-float"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-gold/10 rounded-full blur-3xl animate-float" style={{ animationDelay: "1s" }}></div>
      </div>

      {/* Header */}
      <header className="glass sticky top-0 z-50 border-b border-white/5">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link href="/host-dashboard">
              <button className="p-3 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-all">
                <ArrowLeft size={20} />
              </button>
            </Link>
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-brand rounded-xl blur-xl opacity-50"></div>
                <Image src="/winnerpip-icon.png" alt="WinnerPip" width={40} height={40} className="rounded-xl relative" />
              </div>
              <div>
                <span className="text-lg font-bold gradient-text">Create Challenge</span>
                <p className="text-xs text-gray-500">Step {step} of {totalSteps}</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 md:py-12 max-w-3xl relative">
        {/* Progress Bar */}
        <div className="flex items-center gap-2 mb-10">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex-1 flex items-center gap-2">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all ${
                s < step ? "bg-profit border-profit text-white" :
                s === step ? "bg-royal border-royal text-white" :
                "border-white/20 text-gray-500"
              }`}>
                {s < step ? <Check size={16} /> : s}
              </div>
              {s < 4 && <div className={`flex-1 h-0.5 ${s < step ? "bg-profit" : "bg-white/10"}`} />}
            </div>
          ))}
        </div>

        {/* Step 1: Basic Info */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-8">
              <div className="p-3 bg-royal/20 rounded-xl border border-royal/30">
                <FileText className="text-royal w-6 h-6" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">Basic Information</h2>
                <p className="text-gray-400 text-sm">Set up your challenge details</p>
              </div>
            </div>

            <div className="glass-hover card-glow rounded-2xl p-6 md:p-8 border border-white/20 shadow-[0_12px_40px_rgba(0,0,0,0.4)]">
              <div className="space-y-5">
                <div>
                  <label className="text-sm text-gray-400 mb-2 block font-medium">Challenge Title</label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Challenge 18 - Hybrid" />
                </div>

                <div>
                  <label className="text-sm text-gray-400 mb-3 block font-medium">Challenge Type</label>
                  <div className="grid grid-cols-3 gap-3">
                    {(["demo", "real", "hybrid"] as const).map((t) => (
                      <button key={t} onClick={() => setType(t)}
                        className={`p-4 rounded-xl border text-center transition-all ${
                          type === t ? "border-royal bg-royal/10 text-white" : "border-white/20 text-gray-400 hover:border-white/30"
                        }`}>
                        <p className="font-bold capitalize">{t}</p>
                        <p className="text-xs mt-1 text-gray-500">
                          {t === "demo" ? "Demo accounts" : t === "real" ? "Real accounts" : "Both types"}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-sm text-gray-400 mb-2 block font-medium">Description</label>
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)}
                    placeholder="Brief description of the challenge..."
                    className="flex w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal transition-all min-h-[100px] resize-none" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-gray-400 mb-2 block font-medium">Start Date</label>
                    <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-sm text-gray-400 mb-2 block font-medium">End Date</label>
                    <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Balance & Prizes */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-8">
              <div className="p-3 bg-gold/20 rounded-xl border border-gold/30">
                <DollarSign className="text-gold w-6 h-6" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">Balance & Prizes</h2>
                <p className="text-gray-400 text-sm">Configure financial parameters</p>
              </div>
            </div>

            <div className="glass-hover card-glow rounded-2xl p-6 md:p-8 border border-white/20 shadow-[0_12px_40px_rgba(0,0,0,0.4)]">
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-gray-400 mb-2 block font-medium">Starting Balance ($)</label>
                    <Input type="number" value={startingBalance} onChange={(e) => setStartingBalance(e.target.value)} placeholder="30" />
                  </div>
                  <div>
                    <label className="text-sm text-gray-400 mb-2 block font-medium">Target Balance ($)</label>
                    <Input type="number" value={targetBalance} onChange={(e) => setTargetBalance(e.target.value)} placeholder="60" />
                  </div>
                </div>
              </div>
            </div>

            {/* Prize Pools */}
            {(type === "real" || type === "hybrid") && (
              <div className="glass-hover card-glow rounded-2xl p-6 md:p-8 border border-white/20 shadow-[0_12px_40px_rgba(0,0,0,0.4)]">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <Trophy className="text-gold w-5 h-5" /> Real Account Prizes
                </h3>
                <div className="space-y-3">
                  {realPrizes.map((prize, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-sm text-gray-400 w-16">{i + 1}{["st", "nd", "rd"][i] || "th"}</span>
                      <Input type="number" value={prize} onChange={(e) => updatePrize("real", i, e.target.value)} placeholder="Amount" className="flex-1" />
                      <span className="text-gray-500">$</span>
                      {realPrizes.length > 1 && (
                        <button onClick={() => removePrize("real", i)} className="p-2 text-loss hover:bg-loss/10 rounded-lg"><Trash2 size={16} /></button>
                      )}
                    </div>
                  ))}
                  <button onClick={() => addPrize("real")} className="flex items-center gap-2 text-royal text-sm hover:text-royal-400 transition-all">
                    <Plus size={16} /> Add Prize Position
                  </button>
                </div>
              </div>
            )}

            {(type === "demo" || type === "hybrid") && (
              <div className="glass-hover card-glow rounded-2xl p-6 md:p-8 border border-white/20 shadow-[0_12px_40px_rgba(0,0,0,0.4)]">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <Trophy className="text-royal w-5 h-5" /> Demo Account Prizes
                </h3>
                <div className="space-y-3">
                  {demoPrizes.map((prize, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-sm text-gray-400 w-16">{i + 1}{["st", "nd", "rd"][i] || "th"}</span>
                      <Input type="number" value={prize} onChange={(e) => updatePrize("demo", i, e.target.value)} placeholder="Amount" className="flex-1" />
                      <span className="text-gray-500">$</span>
                      {demoPrizes.length > 1 && (
                        <button onClick={() => removePrize("demo", i)} className="p-2 text-loss hover:bg-loss/10 rounded-lg"><Trash2 size={16} /></button>
                      )}
                    </div>
                  ))}
                  <button onClick={() => addPrize("demo")} className="flex items-center gap-2 text-royal text-sm hover:text-royal-400 transition-all">
                    <Plus size={16} /> Add Prize Position
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Rules */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-8">
              <div className="p-3 bg-loss/20 rounded-xl border border-loss/30">
                <Shield className="text-loss w-6 h-6" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">Trading Rules</h2>
                <p className="text-gray-400 text-sm">Define rules the platform will enforce automatically</p>
              </div>
            </div>

            {/* Active Rules */}
            <div className="space-y-4">
              {selectedRules.map((rule) => {
                const def = RULE_LIBRARY.find((r) => r.code === rule.ruleCode);
                if (!def) return null;
                return (
                  <div key={rule.ruleCode} className="glass-hover card-glow rounded-2xl p-5 border border-white/20 shadow-[0_12px_40px_rgba(0,0,0,0.4)]">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="text-white font-bold">{def.label}</p>
                        <p className="text-gray-400 text-sm">{def.description}</p>
                      </div>
                      <button onClick={() => removeRule(rule.ruleCode)} className="p-2 text-loss hover:bg-loss/10 rounded-lg"><Trash2 size={16} /></button>
                    </div>
                    {def.parameterSchema.length > 0 && (
                      <div className="flex flex-wrap gap-3 mt-3">
                        {def.parameterSchema.map((param) => (
                          <div key={param.key} className="flex items-center gap-2">
                            <label className="text-xs text-gray-500">{param.label}:</label>
                            <Input type="number" value={String(rule.parameters[param.key] || "")}
                              onChange={(e) => updateRuleParam(rule.ruleCode, param.key, parseFloat(e.target.value) || 0)}
                              placeholder={param.placeholder} className="w-24 h-9 text-sm" />
                            {param.unit && <span className="text-xs text-gray-500">{param.unit}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Add Rule */}
            <div className="glass-hover card-glow rounded-2xl p-5 border border-white/20 border-dashed shadow-[0_12px_40px_rgba(0,0,0,0.4)]">
              <p className="text-gray-400 text-sm mb-4 font-medium">Add more rules:</p>
              <div className="flex flex-wrap gap-2">
                {RULE_LIBRARY.filter((r) => !selectedRules.find((s) => s.ruleCode === r.code)).map((rule) => (
                  <button key={rule.code} onClick={() => addRule(rule.code)}
                    className="px-3 py-2 rounded-lg border border-white/10 text-sm text-gray-300 hover:border-royal/50 hover:bg-royal/10 transition-all flex items-center gap-1">
                    <Plus size={14} /> {rule.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Review */}
        {step === 4 && (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-8">
              <div className="p-3 bg-profit/20 rounded-xl border border-profit/30">
                <Check className="text-profit w-6 h-6" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">Review & Create</h2>
                <p className="text-gray-400 text-sm">Confirm your challenge details</p>
              </div>
            </div>

            <div className="glass-hover card-glow rounded-2xl p-6 md:p-8 border border-white/20 shadow-[0_12px_40px_rgba(0,0,0,0.4)]">
              <div className="space-y-6">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Title</p>
                  <p className="text-xl font-bold text-white">{title || "Untitled Challenge"}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Type</p>
                    <p className="text-white font-semibold capitalize">{type}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Period</p>
                    <p className="text-white font-semibold">{startDate || "TBD"} → {endDate || "TBD"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Starting Balance</p>
                    <p className="text-white font-semibold">${startingBalance || "0"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Target Balance</p>
                    <p className="text-gold font-semibold">${targetBalance || "0"}</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Rules ({selectedRules.length})</p>
                  <div className="space-y-1">
                    {selectedRules.map((r) => {
                      const def = RULE_LIBRARY.find((d) => d.code === r.ruleCode);
                      return (
                        <p key={r.ruleCode} className="text-gray-300 text-sm flex items-center gap-2">
                          <span className="text-royal">•</span> {def?.label}
                          {Object.keys(r.parameters).length > 0 && (
                            <span className="text-gray-500">
                              ({Object.values(r.parameters).map((v) => `${v}`).join(", ")})
                            </span>
                          )}
                        </p>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-10">
          <Button onClick={() => setStep(Math.max(1, step - 1))} variant="ghost"
            className={`px-6 py-3 rounded-xl hover:bg-white/5 ${step === 1 ? "invisible" : ""}`}>
            <ChevronLeft size={18} className="mr-1" /> Back
          </Button>
          {step < totalSteps ? (
            <Button onClick={() => setStep(Math.min(totalSteps, step + 1))}
              className="bg-gradient-brand hover:opacity-90 text-white px-8 py-3 rounded-xl shadow-lg shadow-royal/20">
              Next <ChevronRight size={18} className="ml-1" />
            </Button>
          ) : (
            <Button onClick={handleCreate}
              className="bg-gradient-brand hover:opacity-90 text-white px-8 py-3 rounded-xl shadow-lg shadow-royal/20">
              Create Challenge
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
