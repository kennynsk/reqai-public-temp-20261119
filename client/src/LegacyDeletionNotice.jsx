import ReviewDialog from './ReviewDialog.jsx';
export default function LegacyDeletionNotice({ deletion }) {
  return <>
    {deletion.pending && <ReviewDialog label="Удаление требования" onClose={deletion.dismiss}><h2 className="font-bold text-lg">Удалить {deletion.pending.id}?</h2><p className="my-3">Затронутые связи: {deletion.pending.affected.join(', ') || 'нет'}. Ссылки на запись будут убраны; удаление можно отменить до сохранения.</p><div className="flex gap-3"><button onClick={deletion.dismiss} className="p-3 rounded-lg border">Не удалять</button><button onClick={deletion.confirm} className="p-3 rounded-lg bg-red-700 text-white">Подтвердить удаление</button></div></ReviewDialog>}
    {deletion.last && <p role="status" className="p-3 rounded-xl bg-amber-50">Удалено {deletion.last.id}. <button onClick={deletion.undo} className="p-2 text-indigo-700 underline">Отменить удаление</button></p>}
  </>;
}
