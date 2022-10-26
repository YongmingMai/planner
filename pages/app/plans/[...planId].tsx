import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import { CircularProgress, Dialog, Fab, Theme } from '@mui/material';
import { useRouter } from 'next/router';
import React, { Fragment, useEffect, useState } from 'react';
import { makeStyles } from 'tss-react/mui';

import ErrorMessage from '../../../components/common/ErrorMessage';
import PlannerContainer from '../../../components/planner/PlannerContainer';
import PlanningToolbar, {
  usePlanningToolbar,
} from '../../../components/planner/PlanningToolbar/PlanningToolbar';
import { useSemesterNavigation } from '../../../components/planner/SemesterNavigationDrawer/SemesterNavigationDrawer';
import useSearch from '../../../components/search/search';
import { CourseAttempt } from '../../../modules/auth/auth-context';
import { loadCourseAttempts } from '../../../modules/common/api/courseAttempts';
import { loadDummyCourses } from '../../../modules/common/api/courses';
import { StudentPlan } from '../../../modules/common/data';
import { usePlan } from '../../../modules/planner/hooks/usePlan';
import { usePlannerContainer } from '../../../modules/planner/hooks/usePlannerContainer';

/**
 * Styling for the add & remove semesters buttons
 */
const useStyles = makeStyles()((theme: Theme) => {
  return {
    fabContainer: {
      position: 'absolute',
      top: theme.spacing(8),
      right: theme.spacing(2),
      display: 'flex',
      flexDirection: 'column',
    },
    fab: {
      margin: '8px',
      backgroundColor: '#1976d2',
    },
  };
});

/**
 * A page that displays the details of a specific student academic plan.
 * // TODO: Decide planner navigation UX
 */
export default function PlanDetailPage(): JSX.Element {
  const router = useRouter();
  const { planId: planQuery } = router.query;
  const planId = planQuery ? planQuery[0] : 'empty-plan';

  const [courseAttempts, setCourseAttempts] = React.useState<CourseAttempt[]>([]);

  const { results, updateQuery, getResults, err } = useSearch({
    getData: loadDummyCourses,
    initialQuery: '',
    filterFn: (elm, query) => elm['catalogCode'].toLowerCase().includes(query.toLowerCase()),
  });

  const { plan, loadPlan, exportPlan, handleSelectedPlanChange, persistChanges } = usePlan();

  const { title, setTitle, section, setSection, showTabs, hideTabs, shouldShowTabs } =
    usePlanningToolbar(0);

  const {
    semesters,
    addSemester,
    removeSemester,
    updateSemesters,
    handleOnDragEnd,
    removeItemFromList,
    setPersist,
  } = usePlannerContainer(persistChanges, getResults);

  // Load data
  React.useEffect(() => {
    if (router.isReady) {
      const loadData = async () => {
        const newPlan = loadPlan(planId);
        setPersist(true);
        updateSemesters(newPlan.semesters);
        // TODO: Move this logic to custom hook for CourseA
        const courseAttempts: CourseAttempt[] = await loadCourseAttempts();
        setCourseAttempts(courseAttempts);
        setTitle(newPlan.title);
      };
      loadData();
    }
  }, [router.isReady]);

  /**
   * Re-renders the planner UI with the given plan.
   */
  const updateLoadedPlan = (newPlan: StudentPlan) => {
    console.log('Loading new plan in UI', newPlan);
    updateSemesters(newPlan.semesters);
  };

  // TODO: Maybe integrate this with current degree planner
  // if not, then remove
  const navSemesters = plan.semesters;
  const { scrollToSemseter, ...navProps } = useSemesterNavigation(navSemesters);

  const showLeftSidebar = true;
  const handleTabChange = (tabIndex: number) => {
    setSection(tabIndex);
  };

  const { classes } = useStyles();

  const content = (
    <div className="relative overflow-x-hidden">
      <PlannerContainer
        items={semesters}
        onDragEnd={handleOnDragEnd}
        results={results}
        updateQuery={updateQuery}
        removeCourse={removeItemFromList}
      >
        <div className={classes.fabContainer}>
          <Fab color="primary" onClick={() => addSemester()} className={classes.fab}>
            <AddIcon />
          </Fab>
          <Fab color="primary" onClick={() => removeSemester()} className={classes.fab}>
            <RemoveIcon />
          </Fab>
        </div>
      </PlannerContainer>
    </div>
  );
  const validatePlan = () => {
    setShowValidation(true);
  };
  const [showValidation, setShowValidation] = useState(false);
  return (
    <>
      <ValidationDialog
        open={showValidation}
        onClose={() => setShowValidation(false)}
        plan={plan}
      />
      <div className="flex flex-col h-full overflow-x-hidden overflow-y-auto">
        <div className="flex-none">
          {err !== undefined && ErrorMessage(err)}
          <PlanningToolbar
            setPlanTitle={setTitle}
            planId={plan.id}
            sectionIndex={section}
            planTitle={title}
            shouldShowTabs={shouldShowTabs}
            onTabChange={handleTabChange}
            onValidate={validatePlan}
            onExportPlan={() => {
              console.log('Exporting plan');
              exportPlan(plan);
            }}
            onImportPlan={(event) => {
              handleSelectedPlanChange(event, updateLoadedPlan);
            }}
          />
        </div>
        <div className="flex-1">
          <div className="">{content}</div>
        </div>
      </div>
    </>
  );
}

// TODO: Refactor everything below this line into a separate file

const ValidationDialog = (props: { open: boolean; onClose: () => void; plan: StudentPlan }) => {
  const { open, onClose, plan } = props;
  const [loading, setLoading] = useState(true);
  const [outputData, setOutputData] = useState<DVResponse>(null);
  const ac = new AbortController();
  useEffect(() => {
    if (!open) {
      setLoading(true);
      return;
    }
    const performValidation = async () => {
      const body: DVRequest = {
        courses: plan.semesters
          .flatMap((s) => s.courses)
          .map((c) => {
            const split = c.catalogCode.split(' ');
            const department = split[0];
            const courseNumber = Number(split[1]);
            const level = Math.floor(courseNumber / 1000);
            const hours = Math.floor((courseNumber - level * 1000) / 100);
            return {
              name: c.catalogCode,
              department: department,
              level,
              hours,
            };
          }),
        bypasses: [],
        degree: 'computer_science_ug',
      };
      const res = (await (
        await fetch(`${process.env.NEXT_PUBLIC_VALIDATION_SERVER}/validate-degree-plan`, {
          method: 'POST',
          body: JSON.stringify(body),
          signal: ac.signal,
          headers: {
            'content-type': 'application/json',
          },
        })
      ).json()) as DVResponse;
      setOutputData(res);
      setLoading(false);
    };
    performValidation();
    return () => ac.abort();
  }, [open]);
  return (
    <Dialog open={open} onClose={onClose}>
      <div className="p-10">
        <h1>Degree Validation</h1>

        {loading ? (
          <CircularProgress />
        ) : (
          <ul className="list-disc">
            {Object.entries(outputData).map(([key, value]) => {
              return (
                <li className="my-2" key={key}>
                  <div className="flex justify-between">
                    <p className="font-bold">{key}</p>{' '}
                    <p className="text-right">
                      {value.isfilled ? `Complete` : `Incomplete`} ({value.hours} credits)
                    </p>
                  </div>
                  <ul className="list-disc ml-4">
                    {Object.keys(value.courses).length != 0 ? (
                      Object.entries(value.courses).map(([course, credits]) => (
                        <li key={course}>
                          {course} - {credits} credits
                        </li>
                      ))
                    ) : (
                      <li className="italic">No credits planned for this requirement.</li>
                    )}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Dialog>
  );
};

interface DVRequest {
  courses: DVCourse[];
  bypasses: DVBypass[];
  degree: string;
}

interface DVResponse {
  [requirement: string]: DVRequirement;
}

interface DVRequirement {
  courses: Record<string, number>;
  hours: number;
  isfilled: boolean;
}

interface DVBypass {
  course: string;
  requirement: string;
  hours: number;
}

interface DVCourse {
  name: string;
  department: string;
  level: number;
  hours: number;
}
