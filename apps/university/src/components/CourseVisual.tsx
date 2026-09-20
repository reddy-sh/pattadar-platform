import ArticleOutlined from '@mui/icons-material/ArticleOutlined';
import CameraAltOutlined from '@mui/icons-material/CameraAltOutlined';
import GavelOutlined from '@mui/icons-material/GavelOutlined';
import LandscapeOutlined from '@mui/icons-material/LandscapeOutlined';
import MapOutlined from '@mui/icons-material/MapOutlined';
import RuleOutlined from '@mui/icons-material/RuleOutlined';
import type { CourseTone } from '../domain/types';

const icons = {
  records: ArticleOutlined,
  survey: MapOutlined,
  legal: GavelOutlined,
  field: CameraAltOutlined,
  development: LandscapeOutlined,
  service: RuleOutlined,
} satisfies Record<CourseTone, typeof ArticleOutlined>;

export function CourseVisual({ tone }: { tone: CourseTone }) {
  const Icon = icons[tone];
  return (
    <div className={`course-visual course-visual--${tone}`} aria-hidden="true">
      <span className="course-visual__line course-visual__line--one" />
      <span className="course-visual__line course-visual__line--two" />
      <span className="course-visual__line course-visual__line--three" />
      <Icon className="course-visual__icon" />
    </div>
  );
}
