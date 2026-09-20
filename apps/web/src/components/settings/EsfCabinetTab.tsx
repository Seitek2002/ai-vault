"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, ShieldCheck, Unplug } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { settingsApi } from "@/lib/api/settings";
import { esfApi } from "@/lib/api/esf";
import { Button, Card, Input } from "@/components/ui";

const labelClass = "block text-xs text-[var(--color-text-secondary)] mb-1";

function errorText(err: unknown): string {
  const msg = err instanceof ApiError || err instanceof Error ? err.message : "Ошибка";
  return Array.isArray(msg) ? String(msg[0]) : msg;
}

/**
 * Вкладка «Кабинет ЭСФ». Пароль уходит на сервер один раз и хранится там
 * зашифрованным; обратно он не приходит никогда — только флаг «подключён».
 */
export function EsfCabinetTab() {
  const qc = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => settingsApi.getSettings(),
  });

  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const configured = settings?.esfConfigured ?? false;
  const effectiveLogin = login || settings?.esfLogin || "";

  function invalidate() {
    void qc.invalidateQueries({ queryKey: ["settings"] });
  }

  const check = useMutation({
    mutationFn: () => esfApi.checkConnection(effectiveLogin, password),
    onSuccess: () => {
      setChecked(true);
      setError("");
      setNotice("Портал принял логин и пароль");
    },
    onError: (err) => {
      setChecked(false);
      setNotice("");
      setError(errorText(err));
    },
  });

  const save = useMutation({
    mutationFn: () =>
      settingsApi.updateSettings({
        esfLogin: effectiveLogin,
        ...(password ? { esfPassword: password } : {}),
      }),
    onSuccess: () => {
      invalidate();
      setPassword("");
      setChecked(false);
      setError("");
      setNotice("Кабинет подключён. Синхронизация — кнопкой на дашборде и каждую ночь в 06:30.");
    },
    onError: (err) => setError(errorText(err)),
  });

  const disconnect = useMutation({
    mutationFn: () => settingsApi.updateSettings({ esfClear: true }),
    onSuccess: () => {
      invalidate();
      setLogin("");
      setPassword("");
      setChecked(false);
      setNotice("Кабинет отключён, логин и пароль удалены");
      setError("");
    },
    onError: (err) => setError(errorText(err)),
  });

  const syncNow = useMutation({
    mutationFn: () => esfApi.sync(),
    onSuccess: (r) => {
      invalidate();
      void qc.invalidateQueries({ queryKey: ["settlements"] });
      void qc.invalidateQueries({ queryKey: ["esf"] });
      setError(r.errors.length ? `Ошибки по ${r.errors.length} ЭСФ: ${r.errors[0]}` : "");
      setNotice(
        `Получено ${r.fetched}, новых ${r.created}, привязано к расчётам ${r.matched}, без расчёта ${r.unmatched}`,
      );
    },
    onError: (err) => setError(errorText(err)),
  });

  const [pin, setPin] = useState("");
  const savePin = useMutation({
    mutationFn: (clear: boolean) =>
      settingsApi.updateSettings(clear ? { esfHiddenPinClear: true } : { esfHiddenPin: pin }),
    onSuccess: (_r, clear) => {
      invalidate();
      setPin("");
      setError("");
      setNotice(clear ? "Код снят — скрытые ЭСФ видны всем" : "Код доступа к скрытым ЭСФ сохранён");
    },
    onError: (err) => setError(errorText(err)),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!effectiveLogin.trim()) {
      setError("Укажите логин");
      return;
    }
    if (!configured && !password) {
      setError("Укажите пароль");
      return;
    }
    save.mutate();
  }

  const lastSync = settings?.esfLastSyncAt
    ? new Date(settings.esfLastSyncAt).toLocaleString("ru-RU")
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-1">
          Кабинет налогоплательщика esf.salyk.kg
        </h2>
        <p className="text-sm text-[var(--color-text-secondary)]">
          Vault входит в кабинет, забирает список выставленных ЭСФ и сам подтягивает
          официальные PDF. Найденная ЭСФ закрывает шаг «Выставить ЭСФ» в расчёте партнёра.
        </p>
      </div>

      <Card className="p-4">
        <div className="flex items-center gap-3">
          <span
            className={
              configured
                ? "w-2.5 h-2.5 rounded-full bg-[#4ADE80]"
                : "w-2.5 h-2.5 rounded-full bg-[var(--color-border-light)]"
            }
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-[var(--color-text-primary)]">
              {configured ? `Подключён как ${settings?.esfLogin}` : "Не подключён"}
            </p>
            <p className="text-xs text-[var(--color-text-muted)]">
              {configured
                ? lastSync
                  ? `Последняя синхронизация: ${lastSync}`
                  : "Синхронизаций ещё не было"
                : "Введите логин и пароль от кабинета"}
            </p>
            {settings?.esfLastSyncError && (
              <p className="text-xs text-[var(--color-danger)] mt-1 truncate" title={settings.esfLastSyncError}>
                {settings.esfLastSyncError}
              </p>
            )}
          </div>
          {configured && (
            <>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => syncNow.mutate()}
                loading={syncNow.isPending}
                loadingText="Синхронизирую…"
              >
                Синхронизировать
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => disconnect.mutate()}
                disabled={disconnect.isPending}
                title="Удалить логин и пароль"
              >
                <Unplug className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>
      </Card>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={labelClass}>Логин</span>
            <Input
              value={effectiveLogin}
              onChange={(e) => { setLogin(e.target.value); setChecked(false); }}
              autoComplete="off"
              placeholder="как на портале"
            />
          </label>
          <label className="block">
            <span className={labelClass}>{configured ? "Новый пароль" : "Пароль"}</span>
            <Input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setChecked(false); }}
              autoComplete="new-password"
              placeholder={configured ? "оставьте пустым, чтобы не менять" : ""}
            />
          </label>
        </div>

        <p className="text-[11px] text-[var(--color-text-muted)]">
          Пароль шифруется на сервере и никогда не показывается. Это доступ к вашему кабинету
          налогоплательщика — используйте его только на своём сервере.
        </p>

        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
        {notice && !error && <p className="text-sm text-[#4ADE80]">{notice}</p>}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => check.mutate()}
            loading={check.isPending}
            loadingText="Проверяю…"
            disabled={!effectiveLogin || !password}
          >
            <ShieldCheck className="w-4 h-4" />
            Проверить вход
          </Button>
          <Button type="submit" loading={save.isPending} loadingText="Сохраняю…" disabled={!!password && !checked}>
            {configured ? "Обновить" : "Подключить"}
          </Button>
        </div>
        {!!password && !checked && (
          <p className="text-[11px] text-[var(--color-text-muted)] text-right">
            Сначала «Проверить вход» — сохраняем только рабочий пароль
          </p>
        )}
      </form>

      <div className="pt-6 border-t border-[var(--color-border)] space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-1">
            Код доступа к скрытым ЭСФ
          </h3>
          <p className="text-xs text-[var(--color-text-secondary)]">
            Скрытые с дашборда ЭСФ открываются и возвращаются только по этому коду.
            {settings?.esfHiddenPinSet ? " Сейчас код задан." : " Сейчас кода нет — скрытые видны всем."}
          </p>
        </div>
        <div className="flex items-end gap-2">
          <label className="block w-48">
            <span className={labelClass}>{settings?.esfHiddenPinSet ? "Новый код" : "Код"}</span>
            <Input
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              autoComplete="new-password"
              placeholder="от 4 символов"
            />
          </label>
          <Button
            type="button"
            variant="secondary"
            onClick={() => savePin.mutate(false)}
            loading={savePin.isPending}
            loadingText="Сохраняю…"
            disabled={pin.length < 4}
          >
            <KeyRound className="w-4 h-4" />
            {settings?.esfHiddenPinSet ? "Сменить" : "Задать"}
          </Button>
          {settings?.esfHiddenPinSet && (
            <Button type="button" variant="ghost" onClick={() => savePin.mutate(true)} disabled={savePin.isPending}>
              Снять код
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
