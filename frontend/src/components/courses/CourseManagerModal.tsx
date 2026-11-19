import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  deleteCourse, exportCourseJson, listCourses, newCourse, parseImportedCourse, saveCourse, type Course,
} from "../../storage/courses";
import { downloadBlob, safeFilename } from "../../utils/downloads";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { CourseForm } from "./CourseForm";

interface Props {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}

export function CourseManagerModal({ open, onClose, onChanged }: Props) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [editing, setEditing] = useState<Course | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    try {
      setCourses(await listCourses());
    } catch {
      toast.error("Couldn't load your courses.");
    }
  }, []);

  useEffect(() => {
    if (open) {
      setEditing(null);
      setConfirmId(null);
      void reload();
    }
  }, [open, reload]);

  async function save() {
    if (!editing) return;
    try {
      await saveCourse(editing);
      setEditing(null);
      await reload();
      onChanged();
    } catch {
      toast.error("Couldn't save the course.");
    }
  }

  async function remove(id: string) {
    try {
      await deleteCourse(id);
      setConfirmId(null);
      await reload();
      onChanged();
    } catch {
      toast.error("Couldn't delete the course.");
    }
  }

  function exportCourse(c: Course) {
    try {
      downloadBlob(new Blob([exportCourseJson(c)], { type: "application/json" }), `${safeFilename(c.code || c.name)}-course.json`);
    } catch {
      toast.error("Couldn't export the course.");
    }
  }

  async function importFile(file: File) {
    try {
      const course = parseImportedCourse(await file.text());
      await saveCourse(course);
      await reload();
      onChanged();
      toast.success("Course imported");
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "Couldn't import that file.");
    }
  }

  const canSave = !!editing && !!(editing.code.trim() || editing.name.trim());

  return (
    <Modal
      open={open}
      wide
      title={editing ? "Course profile" : "Course profiles"}
      onClose={onClose}
      footer={
        editing ? (
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button variant="primary" disabled={!canSave} onClick={save}>Save</Button>
          </>
        ) : (
          <Button variant="primary" onClick={onClose}>Done</Button>
        )
      }
    >
      {editing ? (
        <div className="max-h-[60vh] overflow-y-auto pr-1">
          <CourseForm course={editing} onChange={setEditing} />
        </div>
      ) : (
        <div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => setEditing(newCourse())}>New course</Button>
            <Button onClick={() => importRef.current?.click()}>Import</Button>
            <input
              ref={importRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              aria-label="Import course file"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void importFile(f);
              }}
            />
          </div>
          {courses.length === 0 ? (
            <p className="mt-4 text-sm text-ink-muted">No courses yet. Add one so generated pages can use the aims and outcomes of your course.</p>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {courses.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span className="font-medium">{[c.code, c.name].filter(Boolean).join(" — ")}</span>
                  <span className="flex gap-1">
                    {confirmId === c.id ? (
                      <>
                        <Button variant="danger" onClick={() => remove(c.id)}>Confirm delete</Button>
                        <Button variant="ghost" onClick={() => setConfirmId(null)}>Cancel</Button>
                      </>
                    ) : (
                      <>
                        <Button variant="ghost" onClick={() => setEditing(c)}>Edit</Button>
                        <Button variant="ghost" onClick={() => exportCourse(c)}>Export</Button>
                        <Button variant="ghost" onClick={() => setConfirmId(c.id)}>Delete</Button>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}
