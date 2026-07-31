import { QuestionEditor } from "@/components/admin/question-editor";

export default async function EditQuestionPage({
  params,
}: {
  params: Promise<{ questionId: string }>;
}) {
  const { questionId } = await params;
  return <QuestionEditor questionId={questionId} />;
}
