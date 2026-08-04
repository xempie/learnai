import { TopicExtras } from "@/components/admin/topic-extras";
import { TopicEditor } from "@/components/admin/episode-manager";
import { ResourceManager } from "@/components/admin/resource-manager";

export const metadata = {
  title: "Topic editor · Admin",
};

export default async function AdminTopicEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="flex flex-col gap-6">
      <TopicEditor topicId={id} />
      {/* Both panels own their own fetch, so a failure in one never blanks the editor. */}
      <TopicExtras topicId={id} />
      <ResourceManager topicId={id} />
    </div>
  );
}
